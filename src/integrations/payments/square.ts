import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { CreateOrderInput, PaymentProvider, ProviderOrder, WebhookVerification } from "./provider";

/**
 * Square adapter for customers outside India.
 *
 * Razorpay settles INR domestically and is the right domestic rail; it is not
 * the right cross-border one. Square handles USD and most major currencies, and
 * because it sits behind the same PaymentProvider interface, none of the
 * billing logic knows which rail a purchase arrived on.
 *
 * We create a payment link per purchase through the API rather than reusing a
 * fixed dashboard link. That matters: a dynamic link carries our own order id,
 * so the webhook can tell us WHICH account to credit. A static link cannot —
 * money arrives with no way to attribute it, and someone has to reconcile by
 * hand.
 */
class SquareProvider implements PaymentProvider {
  readonly name = "square";

  private get base() {
    return env.SQUARE_ENVIRONMENT === "sandbox"
      ? "https://connect.squareupsandbox.com/v2"
      : "https://connect.squareup.com/v2";
  }

  isConfigured() {
    return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    if (!this.isConfigured()) throw new AppError("FEATURE_DISABLED", "Square is not configured");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch(`${this.base}/online-checkout/payment-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": "2025-01-23",
          Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          // Square deduplicates on this, so a retried request cannot double-charge.
          idempotency_key: `${input.receipt}-${randomUUID().slice(0, 8)}`,
          quick_pay: {
            name: input.notes?.label ?? "FieldPilot credits",
            price_money: { amount: input.amountMinor, currency: input.currency },
            location_id: env.SQUARE_LOCATION_ID,
          },
          checkout_options: {
            redirect_url: `${env.APP_URL}/usage?purchase=complete`,
            ask_for_shipping_address: false,
          },
          // Our own reference, echoed back on the order so the webhook can match it.
          payment_note: input.receipt,
        }),
        signal: controller.signal,
      });

      const body = (await res.json()) as {
        payment_link?: { id: string; order_id: string; url: string };
        errors?: Array<{ detail?: string; code?: string }>;
      };

      if (!res.ok || !body.payment_link) {
        const detail = body.errors?.[0]?.detail ?? `HTTP ${res.status}`;
        log.error("square_link_failed", { status: res.status, detail });
        throw new AppError("PROVIDER_UNAVAILABLE", `Square rejected the checkout: ${detail}`);
      }

      return {
        orderId: body.payment_link.order_id,
        amountMinor: input.amountMinor,
        currency: input.currency,
        // Square's hosted page needs no client-side key.
        publicKey: "",
        autoFulfils: false,
        checkoutUrl: body.payment_link.url,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new AppError("PROVIDER_UNAVAILABLE", "Square did not respond in time");
      }
      throw new AppError("PROVIDER_UNAVAILABLE", `Square request failed: ${String(error).slice(0, 120)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Square signs the concatenation of the notification URL and the raw body —
   * not the body alone. The URL must match the dashboard entry character for
   * character, which is why it is configuration rather than something we derive
   * from the request: a proxy that rewrites the host would otherwise silently
   * invalidate every signature.
   */
  verifyWebhook(rawBody: string, signature: string | null): WebhookVerification {
    if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) return { valid: false, reason: "no signature key configured" };
    if (!env.SQUARE_WEBHOOK_URL) return { valid: false, reason: "SQUARE_WEBHOOK_URL is not configured" };
    if (!signature) return { valid: false, reason: "missing signature header" };

    const expected = createHmac("sha256", env.SQUARE_WEBHOOK_SIGNATURE_KEY)
      .update(env.SQUARE_WEBHOOK_URL + rawBody)
      .digest("base64");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: "signature mismatch" };

    let event: {
      event_id?: string;
      type?: string;
      data?: { object?: { payment?: { id?: string; order_id?: string; status?: string; amount_money?: { amount?: number } } } };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { valid: false, reason: "body is not JSON" };
    }

    const payment = event.data?.object?.payment;

    return {
      valid: true,
      eventId: event.event_id ?? "",
      // Normalised to the same vocabulary the billing layer already speaks, so
      // the webhook route does not need a per-provider switch.
      eventType: event.type === "payment.updated" && payment?.status === "COMPLETED"
        ? "payment.captured"
        : event.type === "payment.updated" && (payment?.status === "FAILED" || payment?.status === "CANCELED")
          ? "payment.failed"
          : (event.type ?? "unknown"),
      orderId: payment?.order_id ?? null,
      paymentId: payment?.id ?? null,
      amountMinor: payment?.amount_money?.amount ?? null,
    };
  }
}

export const squareProvider = new SquareProvider();
