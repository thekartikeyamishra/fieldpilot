import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, formatMinor, isSku, packEconomics, packFor, packIsProfitable } from "@/server/billing/catalog";
import { razorpayProvider } from "@/integrations/payments/razorpay";

describe("credit pack catalogue", () => {
  it("rejects a sku the client invented", () => {
    expect(isSku("credits_999999")).toBe(false);
    expect(isSku("__proto__")).toBe(false);
    expect(() => packFor("free_money")).toThrow();
  });

  it("prices money as integers in the smallest unit", () => {
    for (const pack of Object.values(CREDIT_PACKS)) {
      expect(Number.isInteger(pack.amountMinor)).toBe(true);
      expect(pack.amountMinor).toBeGreaterThan(0);
    }
  });

  it("never sells a pack that cannot cover the inference it buys", () => {
    for (const pack of Object.values(CREDIT_PACKS)) {
      expect(packIsProfitable(pack), `${pack.sku} is not profitable at worst case`).toBe(true);
    }
  });

  it("holds a healthy margin at the realistic usage mix", () => {
    for (const pack of Object.values(CREDIT_PACKS)) {
      expect(packEconomics(pack).expectedMarginPct, pack.sku).toBeGreaterThan(60);
    }
  });

  it("refuses a pack priced below its own worst-case cost", () => {
    const underpriced = { ...CREDIT_PACKS.credits_1500, amountMinor: 100 };
    expect(packIsProfitable(underpriced)).toBe(false);
  });

  it("survives a much weaker rupee without going underwater", () => {
    for (const pack of Object.values(CREDIT_PACKS)) {
      expect(packIsProfitable(pack, 0.00009), pack.sku).toBe(true);
    }
  });

  it("gives a better unit price on larger packs", () => {
    const small = CREDIT_PACKS.credits_100.amountMinor / CREDIT_PACKS.credits_100.credits;
    const large = CREDIT_PACKS.credits_1500.amountMinor / CREDIT_PACKS.credits_1500.credits;
    expect(large).toBeLessThan(small);
  });

  it("formats money for display without floating point drift", () => {
    expect(formatMinor(14900, "INR")).toContain("149");
  });
});

describe("razorpay webhook verification", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({
    id: "evt_123",
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_123", order_id: "order_123", amount: 14900 } } },
  });
  const sign = (payload: string, key = secret) => createHmac("sha256", key).update(payload).digest("hex");

  it("rejects a payload with no signature", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    const result = razorpayProvider.verifyWebhook(body, null);
    expect(result.valid).toBe(false);
  });

  it("rejects a forged signature", () => {
    const result = razorpayProvider.verifyWebhook(body, sign(body, "wrong-secret"));
    expect(result.valid).toBe(false);
  });

  it("rejects a signature of a different body", () => {
    const result = razorpayProvider.verifyWebhook(body, sign(`${body} `));
    expect(result.valid).toBe(false);
  });

  it("rejects a truncated signature rather than crashing on length mismatch", () => {
    const result = razorpayProvider.verifyWebhook(body, sign(body).slice(0, 10));
    expect(result.valid).toBe(false);
  });
});

describe("mock provider", () => {
  it("never accepts webhooks, so it cannot be used to forge a grant", async () => {
    const { mockProvider } = await import("@/integrations/payments/mock");
    expect(mockProvider.verifyWebhook().valid).toBe(false);
  });
});
