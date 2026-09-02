import { and, eq, gte, sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage, creditLedger, organizationCredits, outcomes } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { idempotencyKey } from "@/lib/ids";
import { log } from "@/lib/logger";
import { contribution, periodHasRolled, planFor } from "./plans";

/**
 * Credit accounting. Two properties matter and both are enforced here rather
 * than by convention:
 *
 *   1. Atomicity — two concurrent turns on a balance of 1 must not both succeed.
 *      The balance row is locked FOR UPDATE inside a transaction.
 *   2. Fairness — if our infrastructure fails after we charged, we refund.
 *      A provider outage is our problem, not a cost the customer absorbs.
 */

export type CreditState = {
  plan: string;
  balance: number;
  includedPerPeriod: number;
  periodStart: Date;
};

export async function ensureAccount(organizationId: string, plan = "free"): Promise<CreditState> {
  const definition = planFor(plan);

  const [existing] = await db
    .select()
    .from(organizationCredits)
    .where(eq(organizationCredits.organizationId, organizationId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(organizationCredits)
      .values({
        organizationId,
        plan: definition.id,
        balance: definition.creditsPerPeriod,
        includedPerPeriod: definition.creditsPerPeriod,
        lifetimeGranted: definition.creditsPerPeriod,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      await writeLedger({
        organizationId,
        reason: "grant",
        delta: definition.creditsPerPeriod,
        balanceAfter: created.balance,
        key: idempotencyKey(organizationId, "initial-grant"),
      });
      return toState(created);
    }
  }

  const row = existing ?? (await readRow(organizationId));
  return periodHasRolled(row.periodStart) ? await resetPeriod(organizationId) : toState(row);
}

/**
 * Consume credits atomically. Returns the new balance, or throws
 * BUDGET_EXCEEDED — which the caller degrades from rather than failing.
 */
export async function consume(input: {
  organizationId: string;
  userId: string;
  sessionId: string | null;
  amount: number;
  /** Same reference twice = one charge. Retries never double-bill. */
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ balance: number; charged: number }> {
  if (input.amount <= 0) {
    const state = await ensureAccount(input.organizationId);
    return { balance: state.balance, charged: 0 };
  }

  await ensureAccount(input.organizationId);
  const key = idempotencyKey(input.organizationId, "consume", input.reference);

  return db.transaction(async (tx) => {
    // Replay protection first: a retried request returns the original result.
    const [replay] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, key)).limit(1);
    if (replay) return { balance: replay.balanceAfter, charged: 0 };

    // Serialise concurrent consumers of the same balance.
    const [row] = await tx
      .select()
      .from(organizationCredits)
      .where(eq(organizationCredits.organizationId, input.organizationId))
      .for("update")
      .limit(1);

    if (!row) throw new AppError("NOT_FOUND", "no credit account");

    if (row.balance < input.amount) {
      throw new AppError("BUDGET_EXCEEDED", `insufficient credits: ${row.balance} < ${input.amount}`);
    }

    const balanceAfter = row.balance - input.amount;

    await tx
      .update(organizationCredits)
      .set({
        balance: balanceAfter,
        lifetimeConsumed: raw`${organizationCredits.lifetimeConsumed} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(organizationCredits.organizationId, input.organizationId));

    await tx.insert(creditLedger).values({
      organizationId: input.organizationId,
      userId: input.userId,
      sessionId: input.sessionId,
      reason: "consume",
      delta: -input.amount,
      balanceAfter,
      idempotencyKey: key,
      metadata: input.metadata ?? {},
    });

    return { balance: balanceAfter, charged: input.amount };
  });
}

/**
 * Add credits — a purchase, a goodwill grant, a plan change. Idempotent by
 * reference, so a webhook delivered five times grants once.
 * Returns false when the grant was already applied.
 */
export async function grant(input: {
  organizationId: string;
  userId: string | null;
  amount: number;
  reason: "purchase" | "grant";
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ applied: boolean; balance: number }> {
  await ensureAccount(input.organizationId);
  const key = idempotencyKey(input.organizationId, input.reason, input.reference);

  return db.transaction(async (tx) => {
    const [replay] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, key)).limit(1);
    if (replay) return { applied: false, balance: replay.balanceAfter };

    const [row] = await tx
      .select()
      .from(organizationCredits)
      .where(eq(organizationCredits.organizationId, input.organizationId))
      .for("update")
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "no credit account");

    const balanceAfter = row.balance + input.amount;

    await tx
      .update(organizationCredits)
      .set({
        balance: balanceAfter,
        lifetimeGranted: raw`${organizationCredits.lifetimeGranted} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(organizationCredits.organizationId, input.organizationId));

    await tx.insert(creditLedger).values({
      organizationId: input.organizationId,
      userId: input.userId,
      reason: input.reason,
      delta: input.amount,
      balanceAfter,
      idempotencyKey: key,
      metadata: input.metadata ?? {},
    });

    return { applied: true, balance: balanceAfter };
  });
}

/** Infrastructure failure must never punish the user. */
export async function refund(input: {
  organizationId: string;
  userId: string;
  sessionId: string | null;
  amount: number;
  reference: string;
  reason: string;
}): Promise<void> {
  if (input.amount <= 0) return;
  const key = idempotencyKey(input.organizationId, "refund", input.reference);

  try {
    await db.transaction(async (tx) => {
      const [replay] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, key)).limit(1);
      if (replay) return;

      const [row] = await tx
        .select()
        .from(organizationCredits)
        .where(eq(organizationCredits.organizationId, input.organizationId))
        .for("update")
        .limit(1);
      if (!row) return;

      const balanceAfter = row.balance + input.amount;
      await tx
        .update(organizationCredits)
        .set({ balance: balanceAfter, updatedAt: new Date() })
        .where(eq(organizationCredits.organizationId, input.organizationId));

      await tx.insert(creditLedger).values({
        organizationId: input.organizationId,
        userId: input.userId,
        sessionId: input.sessionId,
        reason: "refund",
        delta: input.amount,
        balanceAfter,
        idempotencyKey: key,
        metadata: { cause: input.reason },
      });
    });
  } catch (error) {
    // A failed refund must not mask the original failure the user is seeing.
    log.error("credit_refund_failed", { organizationId: input.organizationId, error: String(error) });
  }
}

async function resetPeriod(organizationId: string): Promise<CreditState> {
  const row = await readRow(organizationId);
  const definition = planFor(row.plan);
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const [updated] = await db
    .update(organizationCredits)
    .set({
      balance: definition.creditsPerPeriod,
      includedPerPeriod: definition.creditsPerPeriod,
      periodStart,
      lifetimeGranted: raw`${organizationCredits.lifetimeGranted} + ${definition.creditsPerPeriod}`,
      updatedAt: new Date(),
    })
    .where(eq(organizationCredits.organizationId, organizationId))
    .returning();

  await writeLedger({
    organizationId,
    reason: "period_reset",
    delta: definition.creditsPerPeriod,
    balanceAfter: updated.balance,
    key: idempotencyKey(organizationId, "reset", periodStart.toISOString()),
  });

  return toState(updated);
}

async function readRow(organizationId: string) {
  const [row] = await db
    .select()
    .from(organizationCredits)
    .where(eq(organizationCredits.organizationId, organizationId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "no credit account");
  return row;
}

async function writeLedger(input: {
  organizationId: string;
  reason: string;
  delta: number;
  balanceAfter: number;
  key: string;
}) {
  await db
    .insert(creditLedger)
    .values({
      organizationId: input.organizationId,
      reason: input.reason,
      delta: input.delta,
      balanceAfter: input.balanceAfter,
      idempotencyKey: input.key,
    })
    .onConflictDoNothing();
}

const toState = (row: {
  plan: string;
  balance: number;
  includedPerPeriod: number;
  periodStart: Date;
}): CreditState => ({
  plan: row.plan,
  balance: row.balance,
  includedPerPeriod: row.includedPerPeriod,
  periodStart: row.periodStart,
});

/**
 * The value receipt. What the customer spent, what came back, and — for an
 * admin — whether the mechanism is actually profitable.
 */
export async function billingSummary(organizationId: string) {
  const state = await ensureAccount(organizationId);
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const [usage] = await db
    .select({
      aiCost: raw<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
      calls: raw<number>`count(*)::int`,
      cacheHits: raw<number>`coalesce(sum(case when ${aiUsage.cacheHit} then 1 else 0 end), 0)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.organizationId, organizationId), gte(aiUsage.createdAt, periodStart)));

  const [value] = await db
    .select({
      jobs: raw<number>`count(*)::int`,
      minutes: raw<number>`coalesce(sum(${outcomes.minutesReturned}), 0)::int`,
    })
    .from(outcomes)
    .where(and(eq(outcomes.organizationId, organizationId), gte(outcomes.createdAt, periodStart)));

  const [spend] = await db
    .select({ consumed: raw<number>`coalesce(sum(-${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.organizationId, organizationId),
        eq(creditLedger.reason, "consume"),
        gte(creditLedger.createdAt, periodStart),
      ),
    );

  const creditsConsumed = spend?.consumed ?? 0;
  const aiCostUsd = Number(usage?.aiCost ?? 0);

  return {
    plan: state.plan,
    balance: state.balance,
    includedPerPeriod: state.includedPerPeriod,
    creditsConsumed,
    jobsCompleted: value?.jobs ?? 0,
    minutesReturned: value?.minutes ?? 0,
    modelCalls: usage?.calls ?? 0,
    cacheHits: usage?.cacheHits ?? 0,
    economics: contribution({ creditsConsumed, aiCostUsd }),
  };
}
