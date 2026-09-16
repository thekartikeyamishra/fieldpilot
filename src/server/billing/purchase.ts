import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payments, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { newId } from "@/lib/ids";
import { recordAudit } from "../audit/audit";
import { track } from "@/lib/analytics";
import { grant } from "./credits";
import { packFor, packIsProfitable, regionForCurrency, type Region, type Sku } from "./catalog";
import { paymentProviderFor } from "@/integrations/payments";

/**
 * Purchase flow.
 *
 * The price comes from the server catalogue, never from the request. The credit
 * grant happens on the provider's webhook, never on the browser's success
 * callback — a callback is a claim, a signed webhook is evidence.
 */

export type CheckoutSession = {
  paymentId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  publicKey: string;
  provider: string;
  credits: number;
  /** Dev-only providers fulfil at once; the UI skips checkout when this is true. */
  autoFulfilled: boolean;
  /** Redirect-style providers (Square) hand back a hosted page instead of a key. */
  checkoutUrl?: string;
};

export async function startCheckout(input: {
  organizationId: string;
  userId: string;
  sku: string;
  /** Defaults to domestic. Currency, not geography, decides price and rail. */
  region?: Region;
}): Promise<CheckoutSession> {
  const region = input.region ?? "IN";
  const pack = packFor(input.sku, region);

  // A pack that cannot cover the inference it buys must never be sold.
  if (!packIsProfitable(pack)) {
    log.error("pack_not_profitable", { sku: pack.sku });
    throw new AppError("FEATURE_DISABLED", "this pack is not available");
  }

  const provider = paymentProviderFor(pack.currency);
  const receipt = `fp_${newId().replace(/-/g, "").slice(0, 20)}`;

  const order = await provider.createOrder({
    amountMinor: pack.amountMinor,
    currency: pack.currency,
    receipt,
    notes: { organizationId: input.organizationId, sku: pack.sku },
  });

  const [row] = await db
    .insert(payments)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: provider.name,
      providerOrderId: order.orderId,
      purpose: "credit_pack",
      sku: pack.sku,
      creditsGranted: 0,
      amountMinor: pack.amountMinor,
      currency: pack.currency,
      status: "created",
      metadata: { receipt, credits: pack.credits },
    })
    .returning();

  await recordAudit({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId,
    action: "payment.order.created",
    resourceType: "payment",
    resourceId: row.id,
    result: "succeeded",
    metadata: { sku: pack.sku, amountMinor: pack.amountMinor, provider: provider.name },
  });

  // The mock provider takes no money, so it fulfils here rather than by webhook.
  if (order.autoFulfils) {
    await fulfil({
      provider: provider.name,
      orderId: order.orderId,
      providerPaymentId: `mock_pay_${newId().slice(0, 12)}`,
      amountMinor: pack.amountMinor,
      eventId: `mock_${order.orderId}`,
      eventType: "payment.captured",
    });
  }

  return {
    paymentId: row.id,
    orderId: order.orderId,
    amountMinor: order.amountMinor,
    currency: order.currency,
    publicKey: order.publicKey,
    provider: provider.name,
    credits: pack.credits,
    autoFulfilled: order.autoFulfils,
    checkoutUrl: order.checkoutUrl,
  };
}

export type FulfilResult = { granted: boolean; reason: string; credits: number };

/**
 * Turns a confirmed payment into credits. Safe to call repeatedly: the event is
 * recorded, the payment row is state-checked, and the grant itself is idempotent.
 * Three independent guards, because double-granting is the expensive mistake.
 */
export async function fulfil(input: {
  provider: string;
  orderId: string;
  providerPaymentId: string | null;
  amountMinor: number | null;
  eventId: string;
  eventType: string;
}): Promise<FulfilResult> {
  // Guard 1: has this exact provider event already been processed?
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: input.provider, eventId: input.eventId || input.orderId, eventType: input.eventType })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) return { granted: false, reason: "event already processed", credits: 0 };

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.provider, input.provider), eq(payments.providerOrderId, input.orderId)))
    .limit(1);

  if (!payment) {
    log.warn("payment_webhook_unknown_order", { orderId: input.orderId });
    return { granted: false, reason: "unknown order", credits: 0 };
  }

  // Guard 2: the payment row itself must not already be settled.
  if (payment.status === "paid") return { granted: false, reason: "already fulfilled", credits: 0 };

  // The provider is authoritative about the amount, and it must match what we
  // asked for. A mismatch is either a bug or tampering; neither gets credits.
  if (input.amountMinor !== null && input.amountMinor !== payment.amountMinor) {
    await db
      .update(payments)
      .set({ status: "failed", metadata: { ...payment.metadata, mismatch: input.amountMinor }, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await recordAudit({
      organizationId: payment.organizationId,
      actorType: "system",
      action: "payment.amount_mismatch",
      resourceType: "payment",
      resourceId: payment.id,
      result: "failed",
      metadata: { expected: payment.amountMinor, received: input.amountMinor },
    });
    return { granted: false, reason: "amount mismatch", credits: 0 };
  }

  const pack = packFor(payment.sku as Sku, regionForCurrency(payment.currency));

  // Guard 3: the credit grant is itself idempotent by order id.
  const result = await grant({
    organizationId: payment.organizationId,
    userId: payment.userId,
    amount: pack.credits,
    reason: "purchase",
    reference: input.orderId,
    metadata: { sku: pack.sku, provider: input.provider },
  });

  await db
    .update(payments)
    .set({
      status: "paid",
      providerPaymentId: input.providerPaymentId,
      creditsGranted: result.applied ? pack.credits : 0,
      fulfilledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  await recordAudit({
    organizationId: payment.organizationId,
    actorType: "system",
    action: "payment.fulfilled",
    resourceType: "payment",
    resourceId: payment.id,
    result: "succeeded",
    metadata: { credits: pack.credits, amountMinor: payment.amountMinor, provider: input.provider },
  });

  await track({
    organizationId: payment.organizationId,
    userId: payment.userId,
    event: "credits_purchased",
    properties: { sku: pack.sku, credits: pack.credits, amountMinor: payment.amountMinor },
  });

  return { granted: result.applied, reason: result.applied ? "granted" : "grant already applied", credits: pack.credits };
}

export async function markFailed(provider: string, orderId: string, reason: string) {
  await db
    .update(payments)
    .set({ status: "failed", metadata: { reason }, updatedAt: new Date() })
    .where(and(eq(payments.provider, provider), eq(payments.providerOrderId, orderId)));
}

export async function listPayments(organizationId: string, limit = 20) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

/** True only when a purchase could actually succeed right now. */
export const paymentsEnabled = () =>
  env.PAYMENTS_PROVIDER === "razorpay"
    ? Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)
    : env.NODE_ENV !== "production";
