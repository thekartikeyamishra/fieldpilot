import "server-only";
import { and, eq, gte, sql as raw, type SQL } from "drizzle-orm";
import { db, sql as client } from "@/db/client";
import { aiUsage, voiceSessions } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { costOf, estimateTokens } from "./pricing";
import { track } from "@/lib/analytics";

/**
 * Every paid inference passes through here first. There is no code path that
 * calls a model without a budget decision, so a user cannot create an
 * unbounded loss for the business.
 */
export type Verdict = "allow" | "degrade" | "stop";

export type BudgetDecision = {
  verdict: Verdict;
  /** "fast" is the cheap tier, "smart" the reasoning tier. Degrade always lands on fast. */
  tier: "fast" | "smart";
  reason: string;
  spent: { session: number; userToday: number; orgMonth: number };
  remainingSession: number;
};

export type BudgetQuery = {
  organizationId: string;
  userId: string;
  sessionId: string;
  desiredTier: "fast" | "smart";
  estimatedInputChars: number;
};

const startOfDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function spend(where: SQL | undefined): Promise<number> {
  const [row] = await db
    .select({ total: raw<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)` })
    .from(aiUsage)
    .where(where);
  return Number(row?.total ?? 0);
}

/**
 * Serialises the paid path for one session.
 *
 * checkBudget reads spend and recordUsage writes it, so two simultaneous turns
 * could both read the same pre-spend total and both pass a ceiling they jointly
 * exceed. Credits are charged atomically and first, which bounds the damage to
 * roughly one extra call — but "roughly bounded" is not a cost control.
 *
 * A transaction-scoped advisory lock keyed on the session costs nothing in the
 * normal case, because concurrent turns within a single voice session are
 * already an anomaly rather than a workload.
 */
export async function withSessionBudgetLock<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  try {
    await client`select pg_advisory_lock(hashtext(${`budget:${sessionId}`}))`;
    return await run();
  } finally {
    await client`select pg_advisory_unlock(hashtext(${`budget:${sessionId}`}))`.catch(() => {});
  }
}

export async function checkBudget(q: BudgetQuery): Promise<BudgetDecision> {
  const [session] = await db.select().from(voiceSessions).where(eq(voiceSessions.id, q.sessionId)).limit(1);
  if (!session) throw new AppError("NOT_FOUND", "voice session not found");
  if (session.organizationId !== q.organizationId) throw new AppError("FORBIDDEN", "session belongs to another tenant");

  if (session.modelCalls >= env.VOICE_MAX_MODEL_CALLS_PER_SESSION) {
    throw new AppError("SESSION_LIMIT_REACHED", "model call ceiling reached for session");
  }

  const [sessionSpend, userSpend, orgSpend] = await Promise.all([
    spend(eq(aiUsage.sessionId, q.sessionId)),
    spend(and(eq(aiUsage.userId, q.userId), gte(aiUsage.createdAt, startOfDay()))),
    spend(and(eq(aiUsage.organizationId, q.organizationId), gte(aiUsage.createdAt, startOfMonth()))),
  ]);

  const spent = { session: sessionSpend, userToday: userSpend, orgMonth: orgSpend };
  const remainingSession = env.AI_COST_LIMIT_PER_SESSION - sessionSpend;

  const stop =
    sessionSpend >= env.AI_COST_LIMIT_PER_SESSION ||
    userSpend >= env.AI_COST_LIMIT_PER_USER_DAY ||
    orgSpend >= env.AI_COST_LIMIT_PER_ORG_MONTH;

  if (stop) {
    log.warn("budget_stop", { spent });
    await track({
      organizationId: q.organizationId,
      userId: q.userId,
      event: "budget_ceiling_hit",
      properties: { sessionSpend, userSpend, orgSpend },
    });
    return { verdict: "stop", tier: "fast", reason: "usage allowance reached", spent, remainingSession };
  }

  // Would the smart tier alone blow the remaining session budget? Then degrade
  // instead of failing: a cheaper answer beats no answer.
  const projected = costOf(
    q.desiredTier === "smart" ? env.AI_MODEL_SMART : env.AI_MODEL_FAST,
    estimateTokens(String(q.estimatedInputChars)) + q.estimatedInputChars / 4,
    400,
  );

  if (q.desiredTier === "smart" && projected > remainingSession * 0.6) {
    return { verdict: "degrade", tier: "fast", reason: "session budget favours the cheaper model", spent, remainingSession };
  }
  if (sessionSpend > env.AI_COST_LIMIT_PER_SESSION * 0.7) {
    return { verdict: "degrade", tier: "fast", reason: "70% of session budget consumed", spent, remainingSession };
  }

  return { verdict: "allow", tier: q.desiredTier, reason: "within budget", spent, remainingSession };
}

/** Post-call accounting. Cost per completed job is derivable from these rows. */
export async function recordUsage(u: {
  organizationId: string;
  userId: string;
  sessionId: string | null;
  provider: string;
  model: string;
  taskClass: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  fallbackUsed?: boolean;
  cacheHit?: boolean;
}): Promise<number> {
  const cost = u.cacheHit ? 0 : costOf(u.model, u.inputTokens, u.outputTokens);

  await db.insert(aiUsage).values({
    organizationId: u.organizationId,
    userId: u.userId,
    sessionId: u.sessionId,
    provider: u.provider,
    model: u.model,
    taskClass: u.taskClass,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    estimatedCostUsd: cost.toFixed(6),
    latencyMs: u.latencyMs,
    success: u.success,
    fallbackUsed: u.fallbackUsed ?? false,
    cacheHit: u.cacheHit ?? false,
  });

  if (u.sessionId) {
    await db
      .update(voiceSessions)
      .set({
        modelCalls: raw`${voiceSessions.modelCalls} + 1`,
        estimatedCostUsd: raw`${voiceSessions.estimatedCostUsd} + ${cost.toFixed(6)}`,
      })
      .where(eq(voiceSessions.id, u.sessionId));
  }

  return cost;
}
