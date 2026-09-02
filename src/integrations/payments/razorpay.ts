import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { CreateOrderInput, PaymentProvider, ProviderOrder, WebhookVerification } from "./provider";

/**
 * Razorpay adapter. Chosen first because the initial market is India and
 * Razorpay settles INR domestically; the interface above keeps Stripe or PayPal
 * one file away for cross-border customers.
 *
 * Uses the REST API directly rather than the SDK: two endpoints, no dependency,
 * no supply-chain surface.
 */
class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";
  private readonly base = "https://api.razorpay.com/v1";

  isConfigured() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    if (!this.isConfigured()) throw new AppError("FEATURE_DISABLED", "Razorpay keys are not configured");

    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(`${this.base}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: input.amountMinor,
          currency: input.currency,
          receipt: input.receipt,
          notes: input.notes ?? {},
          payment_capture: 1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.error("razorpay_order_failed", { status: res.status, body: body.slice(0, 200) });
        throw new AppError("PROVIDER_UNAVAILABLE", `order creation failed (${res.status})`);
      }

      const data = (await res.json()) as { id?: string; amount?: number; currency?: string };
      if (!data.id) throw new AppError("PROVIDER_UNAVAILABLE", "order id missing from provider response");

      return {
        orderId: data.id,
        amountMinor: data.amount ?? input.amountMinor,
        currency: data.currency ?? input.currency,
        publicKey: env.RAZORPAY_KEY_ID,
        autoFulfils: false,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("PROVIDER_UNAVAILABLE", String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Signature is HMAC-SHA256 of the raw request body. The body must be verified
   * before it is parsed — parsing untrusted JSON first is how forged events get in.
   */
  verifyWebhook(rawBody: string, signature: string | null): WebhookVerification {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return { valid: false, reason: "webhook secret not configured" };
    if (!signature) return { valid: false, reason: "missing signature header" };

    const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: "signature mismatch" };

    let event: {
      event?: string;
      id?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { valid: false, reason: "malformed payload" };
    }

    const entity = event.payload?.payment?.entity;
    return {
      valid: true,
      eventId: event.id ?? entity?.id ?? "",
      eventType: event.event ?? "unknown",
      orderId: entity?.order_id ?? null,
      paymentId: entity?.id ?? null,
      amountMinor: typeof entity?.amount === "number" ? entity.amount : null,
    };
  }
}

export const razorpayProvider = new RazorpayProvider();
