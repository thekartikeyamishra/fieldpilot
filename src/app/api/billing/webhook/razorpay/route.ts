import { log } from "@/lib/logger";
import { razorpayProvider } from "@/integrations/payments/razorpay";
import { fulfil, markFailed } from "@/server/billing/purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only place a purchase becomes credits.
 *
 * The raw body is read as text and verified before anything parses it: parsing
 * untrusted JSON first is how forged events get in. A verification failure
 * returns 400 and nothing else — no detail that would help someone tune a forgery.
 *
 * Successful handling always returns 200, including for events we ignore, so the
 * provider stops retrying. Only a genuine processing failure returns 5xx.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const verification = razorpayProvider.verifyWebhook(rawBody, signature);
  if (!verification.valid) {
    log.warn("webhook_rejected", { provider: "razorpay", reason: verification.reason });
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    if (verification.eventType === "payment.captured" && verification.orderId) {
      const result = await fulfil({
        provider: "razorpay",
        orderId: verification.orderId,
        providerPaymentId: verification.paymentId,
        amountMinor: verification.amountMinor,
        eventId: verification.eventId,
        eventType: verification.eventType,
      });
      log.info("webhook_processed", { event: verification.eventType, granted: result.granted, reason: result.reason });
    } else if (verification.eventType === "payment.failed" && verification.orderId) {
      await markFailed("razorpay", verification.orderId, "provider reported failure");
    } else {
      log.info("webhook_ignored", { event: verification.eventType });
    }

    return Response.json({ ok: true });
  } catch (error) {
    // 5xx asks the provider to retry, which is correct: the payment is real and
    // the customer is owed their credits.
    log.error("webhook_processing_failed", { event: verification.eventType, error: String(error) });
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
