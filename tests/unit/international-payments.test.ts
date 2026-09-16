import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKS,
  INTL_CREDIT_PACKS,
  SQUARE_FEE_FIXED_MINOR,
  SQUARE_FEE_RATE,
  netAfterFees,
  packFor,
  packsForRegion,
  regionForCurrency,
} from "@/server/billing/catalog";
import { squareProvider } from "@/integrations/payments/square";
import { env } from "@/lib/env";

describe("region routing", () => {
  it("routes INR domestically and everything else cross-border", () => {
    expect(regionForCurrency("INR")).toBe("IN");
    expect(regionForCurrency("inr")).toBe("IN");
    for (const c of ["USD", "EUR", "GBP", "AUD", "AED", "SGD"]) {
      expect(regionForCurrency(c), c).toBe("INTL");
    }
  });

  it("serves a different price list per region", () => {
    expect(packsForRegion("IN")[0].currency).toBe("INR");
    expect(packsForRegion("INTL")[0].currency).toBe(env.PAYMENTS_CURRENCY_INTL);
    expect(packFor("credits_400", "INTL").amountMinor).not.toBe(packFor("credits_400", "IN").amountMinor);
  });

  it("offers the same credits on both rails — only the price differs", () => {
    for (const sku of Object.keys(CREDIT_PACKS) as Array<keyof typeof CREDIT_PACKS>) {
      expect(INTL_CREDIT_PACKS[sku].credits, sku).toBe(CREDIT_PACKS[sku].credits);
    }
  });
});

describe("international margin survives real provider fees", () => {
  it("the fixed 30c fee does not eat the smallest pack", () => {
    // The trap: a $2 pack loses 15% to the fixed fee alone before anything else.
    const smallest = INTL_CREDIT_PACKS.credits_100;
    const feeShare = SQUARE_FEE_FIXED_MINOR / smallest.amountMinor;
    expect(feeShare).toBeLessThan(0.05);
  });

  it("every international pack still nets more per credit than the domestic one", () => {
    // If it did not, we would be doing cross-border work for less money than
    // domestic — which is the whole reason not to simply convert the rupee price.
    const inrPerCreditUsd = (CREDIT_PACKS.credits_400.amountMinor / CREDIT_PACKS.credits_400.credits) * 0.00012 * 100;
    const usdPerCredit = netAfterFees(INTL_CREDIT_PACKS.credits_400) / INTL_CREDIT_PACKS.credits_400.credits;
    expect(usdPerCredit).toBeGreaterThan(inrPerCreditUsd);
  });

  it("nets at least 92% on a large pack and never less than 85% on the smallest", () => {
    expect(netAfterFees(INTL_CREDIT_PACKS.credits_1500) / INTL_CREDIT_PACKS.credits_1500.amountMinor).toBeGreaterThan(0.92);
    expect(netAfterFees(INTL_CREDIT_PACKS.credits_100) / INTL_CREDIT_PACKS.credits_100.amountMinor).toBeGreaterThan(0.85);
  });

  it("net is always less than gross — fees are never optimistically ignored", () => {
    for (const pack of Object.values(INTL_CREDIT_PACKS)) {
      expect(netAfterFees(pack), pack.sku).toBeLessThan(pack.amountMinor);
      expect(netAfterFees(pack), pack.sku).toBeGreaterThan(0);
    }
  });

  it("larger packs give the buyer a genuine discount per credit", () => {
    const small = INTL_CREDIT_PACKS.credits_100.amountMinor / 100;
    const large = INTL_CREDIT_PACKS.credits_1500.amountMinor / 1500;
    expect(large).toBeLessThan(small);
  });
});

describe("Square webhook verification", () => {
  const url = "https://fieldpilot.me/api/billing/webhook/square";
  const key = "test-square-signature-key";
  const body = JSON.stringify({
    event_id: "evt_1",
    type: "payment.updated",
    data: { object: { payment: { id: "pay_1", order_id: "ord_1", status: "COMPLETED", amount_money: { amount: 2900 } } } },
  });
  const sign = (u: string, b: string, k = key) => createHmac("sha256", k).update(u + b).digest("base64");

  const withEnv = <T,>(run: () => T): T => {
    const prevKey = env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const prevUrl = env.SQUARE_WEBHOOK_URL;
    (env as { SQUARE_WEBHOOK_SIGNATURE_KEY: string }).SQUARE_WEBHOOK_SIGNATURE_KEY = key;
    (env as { SQUARE_WEBHOOK_URL: string }).SQUARE_WEBHOOK_URL = url;
    try {
      return run();
    } finally {
      (env as { SQUARE_WEBHOOK_SIGNATURE_KEY: string }).SQUARE_WEBHOOK_SIGNATURE_KEY = prevKey;
      (env as { SQUARE_WEBHOOK_URL: string }).SQUARE_WEBHOOK_URL = prevUrl;
    }
  };

  it("accepts a correctly signed completed payment and normalises the event", () => {
    withEnv(() => {
      const v = squareProvider.verifyWebhook(body, sign(url, body));
      expect(v.valid).toBe(true);
      if (v.valid) {
        expect(v.eventType).toBe("payment.captured");
        expect(v.orderId).toBe("ord_1");
        expect(v.amountMinor).toBe(2900);
      }
    });
  });

  it("rejects an unsigned request", () => {
    withEnv(() => expect(squareProvider.verifyWebhook(body, null).valid).toBe(false));
  });

  it("rejects a signature made with the wrong key", () => {
    withEnv(() => expect(squareProvider.verifyWebhook(body, sign(url, body, "wrong")).valid).toBe(false));
  });

  it("rejects a body edited after signing", () => {
    withEnv(() => {
      const tampered = body.replace('"amount":2900', '"amount":1');
      expect(squareProvider.verifyWebhook(tampered, sign(url, body)).valid).toBe(false);
    });
  });

  it("rejects a signature computed over a DIFFERENT notification url", () => {
    // The classic Square integration bug: signing the body alone, or signing a
    // url that differs by a trailing slash. Both must fail closed.
    withEnv(() => {
      expect(squareProvider.verifyWebhook(body, sign(url + "/", body)).valid).toBe(false);
      expect(squareProvider.verifyWebhook(body, createHmac("sha256", key).update(body).digest("base64")).valid).toBe(false);
    });
  });

  it("does not treat a pending payment as captured", () => {
    withEnv(() => {
      const pending = body.replace("COMPLETED", "PENDING");
      const v = squareProvider.verifyWebhook(pending, sign(url, pending));
      expect(v.valid).toBe(true);
      if (v.valid) expect(v.eventType).not.toBe("payment.captured");
    });
  });

  it("maps a failed payment so credits are never granted for it", () => {
    withEnv(() => {
      const failed = body.replace("COMPLETED", "FAILED");
      const v = squareProvider.verifyWebhook(failed, sign(url, failed));
      if (v.valid) expect(v.eventType).toBe("payment.failed");
    });
  });

  it("refuses to verify when the notification url is not configured", () => {
    // Without it Square's scheme cannot be reproduced; failing closed is the
    // only safe answer.
    const prev = env.SQUARE_WEBHOOK_URL;
    (env as { SQUARE_WEBHOOK_URL: string }).SQUARE_WEBHOOK_URL = "";
    expect(squareProvider.verifyWebhook(body, "anything").valid).toBe(false);
    (env as { SQUARE_WEBHOOK_URL: string }).SQUARE_WEBHOOK_URL = prev;
  });
});
