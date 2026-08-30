import "server-only";
import { and, desc, eq, gte, sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { TIME_SAVED_MINUTES, ATTRIBUTION_BASIS } from "./attribution";
import { aiUsage, assets, outcomes, voiceSessions, workOrders } from "@/db/schema";

/**
 * The outcome ledger. Value is counted in completed work, never in AI activity,
 * and attribution stays conservative: minutes returned come from a published
 * table of assumptions, not from a number the model made up.
 */
export { ATTRIBUTION_BASIS, TIME_SAVED_MINUTES } from "./attribution";

export async function recordOutcome(input: {
  organizationId: string;
  sessionId: string;
  assetId: string | null;
  workOrderId?: string | null;
  problemSummary: string;
  recommendation: string;
  action: string;
  toolName: string;
  evidence: unknown[];
  durationMs: number;
}) {
  const [costRow] = await db
    .select({ total: raw<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)` })
    .from(aiUsage)
    .where(eq(aiUsage.sessionId, input.sessionId));

  const [row] = await db
    .insert(outcomes)
    .values({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      assetId: input.assetId,
      workOrderId: input.workOrderId ?? null,
      problemSummary: input.problemSummary.slice(0, 400),
      recommendation: input.recommendation.slice(0, 600),
      action: input.action.slice(0, 200),
      evidence: input.evidence,
      durationMs: input.durationMs,
      minutesReturned: TIME_SAVED_MINUTES[input.toolName] ?? 0,
      aiCostUsd: Number(costRow?.total ?? 0).toFixed(6),
    })
    .returning();

  return row;
}

export async function listOutcomes(organizationId: string, limit = 25) {
  return db
    .select({
      id: outcomes.id,
      problemSummary: outcomes.problemSummary,
      recommendation: outcomes.recommendation,
      action: outcomes.action,
      minutesReturned: outcomes.minutesReturned,
      aiCostUsd: outcomes.aiCostUsd,
      durationMs: outcomes.durationMs,
      createdAt: outcomes.createdAt,
      evidence: outcomes.evidence,
      assetName: assets.name,
      assetCode: assets.assetCode,
      workOrderNumber: workOrders.number,
    })
    .from(outcomes)
    .leftJoin(assets, eq(assets.id, outcomes.assetId))
    .leftJoin(workOrders, eq(workOrders.id, outcomes.workOrderId))
    .where(eq(outcomes.organizationId, organizationId))
    .orderBy(desc(outcomes.createdAt))
    .limit(limit);
}

/** The founder-facing unit economics view: cost per completed job, not per token. */
export async function economics(organizationId: string) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [agg] = await db
    .select({
      jobs: raw<number>`count(*)::int`,
      minutes: raw<number>`coalesce(sum(${outcomes.minutesReturned}), 0)::int`,
      aiCost: raw<string>`coalesce(sum(${outcomes.aiCostUsd}), 0)`,
      avgDuration: raw<number>`coalesce(avg(${outcomes.durationMs}), 0)::int`,
    })
    .from(outcomes)
    .where(and(eq(outcomes.organizationId, organizationId), gte(outcomes.createdAt, monthStart)));

  const [sessionAgg] = await db
    .select({
      sessions: raw<number>`count(*)::int`,
      voiceCost: raw<string>`coalesce(sum(${voiceSessions.estimatedCostUsd}), 0)`,
    })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.organizationId, organizationId), gte(voiceSessions.startedAt, monthStart)));

  const jobs = agg?.jobs ?? 0;
  const aiCost = Number(agg?.aiCost ?? 0);

  return {
    jobs,
    minutesReturned: agg?.minutes ?? 0,
    aiCostUsd: aiCost,
    costPerJobUsd: jobs > 0 ? aiCost / jobs : 0,
    sessions: sessionAgg?.sessions ?? 0,
    avgSessionMs: agg?.avgDuration ?? 0,
    basis: ATTRIBUTION_BASIS,
  };
}
