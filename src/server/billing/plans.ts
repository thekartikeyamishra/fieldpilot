import { env } from "@/lib/env";

/**
 * Plan definitions and the unit economics behind them. Pure functions so the
 * margin arithmetic is testable and cannot drift from what we charge.
 */
export type PlanId = "free" | "pro";

export type Plan = {
  id: PlanId;
  label: string;
  creditsPerPeriod: number;
  /** Monthly price in USD. Free is genuinely free — no card, no trial timer. */
  priceUsd: number;
};

/**
 * CREDIT_PRICE_USD must stay consistent with the pack catalogue, or every
 * margin figure in the product is wrong. It is set to the lowest realised
 * per-credit rate, so contribution is understated rather than overstated.
 */
export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", label: "Free", creditsPerPeriod: env.CREDITS_FREE_PER_MONTH, priceUsd: 0 },
  pro: {
    id: "pro",
    label: "Pro",
    creditsPerPeriod: env.CREDITS_PRO_PER_MONTH,
    priceUsd: Number((env.CREDITS_PRO_PER_MONTH * env.CREDIT_PRICE_USD * 0.6).toFixed(2)),
  },
};

export const planFor = (id: string): Plan => PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];

/**
 * What a turn costs the customer, in credits.
 * Deterministic rules and cache hits are free: we did not pay a provider, so
 * charging for them would be renting the customer their own repetition.
 */
export function creditsForTurn(path: "rule" | "cache" | "model" | "fallback", tier: "fast" | "smart"): number {
  if (path === "rule" || path === "cache" || path === "fallback") return 0;
  return tier === "smart" ? env.CREDITS_PER_REASONING_TURN : env.CREDITS_PER_FAST_TURN;
}

/**
 * The guardrail: no mechanism may be net-negative after all costs.
 * Compares what a period's credits earned against what the AI actually cost.
 */
export function contribution(input: { creditsConsumed: number; aiCostUsd: number; voiceCostUsd?: number }) {
  const revenue = input.creditsConsumed * env.CREDIT_PRICE_USD;
  const variableCost = input.aiCostUsd + (input.voiceCostUsd ?? 0);
  const margin = revenue - variableCost;
  return {
    revenueUsd: revenue,
    variableCostUsd: variableCost,
    contributionUsd: margin,
    contributionMarginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
    healthy: revenue === 0 ? variableCost === 0 : margin > 0,
  };
}

/** True when the period a balance was granted for has rolled over. */
export function periodHasRolled(periodStart: Date, now = new Date()): boolean {
  return (
    periodStart.getUTCFullYear() !== now.getUTCFullYear() ||
    periodStart.getUTCMonth() !== now.getUTCMonth()
  );
}
