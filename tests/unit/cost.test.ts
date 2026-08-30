import { describe, expect, it } from "vitest";
import { costOf, estimateTokens, priceFor, voiceCost } from "@/server/cost/pricing";
import { TIME_SAVED_MINUTES } from "@/server/outcomes/attribution";

describe("cost accounting", () => {
  it("prices a known model from the table", () => {
    expect(costOf("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15, 5);
  });

  it("falls back to a conservative price for an unknown model", () => {
    expect(priceFor("some-model-shipped-tomorrow").inputPerMTok).toBeGreaterThan(0);
  });

  it("keeps a realistic turn well inside the per-session ceiling", () => {
    const turn = costOf("gpt-4o-mini", 1800, 300);
    expect(turn).toBeLessThan(0.01);
  });

  it("prices voice on connection time", () => {
    expect(voiceCost(120_000)).toBeCloseTo(0.015, 6);
  });

  it("estimates tokens from characters", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("never claims more time saved than the manual task plausibly takes", () => {
    for (const minutes of Object.values(TIME_SAVED_MINUTES)) {
      expect(minutes).toBeGreaterThan(0);
      expect(minutes).toBeLessThanOrEqual(20);
    }
  });
});
