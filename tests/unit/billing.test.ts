import { describe, expect, it } from "vitest";
import { contribution, creditsForTurn, periodHasRolled, PLANS, planFor } from "@/server/billing/plans";

describe("credit pricing", () => {
  it("charges nothing for work we did not pay a provider for", () => {
    expect(creditsForTurn("rule", "fast")).toBe(0);
    expect(creditsForTurn("cache", "smart")).toBe(0);
    expect(creditsForTurn("fallback", "smart")).toBe(0);
  });

  it("charges more for reasoning than for a simple turn", () => {
    expect(creditsForTurn("model", "smart")).toBeGreaterThan(creditsForTurn("model", "fast"));
  });

  it("falls back to the free plan for an unknown plan id", () => {
    expect(planFor("enterprise-platinum").id).toBe("free");
    expect(planFor("pro").id).toBe("pro");
  });

  it("keeps the free plan genuinely free", () => {
    expect(PLANS.free.priceUsd).toBe(0);
    expect(PLANS.free.creditsPerPeriod).toBeGreaterThan(0);
  });
});

describe("contribution guardrail", () => {
  it("is positive at realistic usage", () => {
    // 100 credits sold against what 100 cheap turns actually cost us.
    const c = contribution({ creditsConsumed: 100, aiCostUsd: 0.5 });
    expect(c.contributionUsd).toBeGreaterThan(0);
    expect(c.healthy).toBe(true);
  });

  it("flags a mechanism that costs more than it earns", () => {
    const c = contribution({ creditsConsumed: 10, aiCostUsd: 50 });
    expect(c.healthy).toBe(false);
    expect(c.contributionUsd).toBeLessThan(0);
  });

  it("treats zero revenue with zero cost as healthy, not divide-by-zero", () => {
    const c = contribution({ creditsConsumed: 0, aiCostUsd: 0 });
    expect(c.healthy).toBe(true);
    expect(c.contributionMarginPct).toBe(0);
  });

  it("treats free usage that costs us money as unhealthy", () => {
    expect(contribution({ creditsConsumed: 0, aiCostUsd: 0.2 }).healthy).toBe(false);
  });

  it("counts voice cost as a variable cost", () => {
    const withVoice = contribution({ creditsConsumed: 10, aiCostUsd: 0.1, voiceCostUsd: 0.05 });
    expect(withVoice.variableCostUsd).toBeCloseTo(0.15, 6);
  });
});

describe("billing period", () => {
  it("rolls over into a new month", () => {
    expect(periodHasRolled(new Date("2026-07-01T00:00:00Z"), new Date("2026-08-02T00:00:00Z"))).toBe(true);
  });

  it("does not roll over inside the same month", () => {
    expect(periodHasRolled(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-30T23:00:00Z"))).toBe(false);
  });

  it("rolls over across a year boundary", () => {
    expect(periodHasRolled(new Date("2025-12-31T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
});
