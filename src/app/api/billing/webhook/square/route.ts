import { log } from "@/lib/logger";
import { squareProvider } from "@/integrations/payments/square";
import { fulfil, markFailed } from "@/server/billing/purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Square's side of the only place a purchase becomes credits.
 *
 * Same discipline as the Razorpay route: read the body as raw text, verify
 * before anything parses it, and reveal nothing on failure that would help
 * someone tune a forgery. Square signs (notification URL + body), so a mismatch
 * in SQUARE_WEBHOOK_URL fails exactly like a forged request would — which is
 * why that value is configuration and not derived from the incoming request.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");

  const verification = squareProvider.verifyWebhook(rawBody, signature);
  if (!verification.valid) {
    log.warn("webhook_rejected", { provider: "square", reason: verification.reason });
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    if (verification.eventType === "payment.captured" && verification.orderId) {
      const result = await fulfil({
        provider: "square",
        orderId: verification.orderId,
        providerPaymentId: verification.paymentId,
        amountMinor: verification.amountMinor,
        eventId: verification.eventId,
        eventType: verification.eventType,
      });
      log.info("webhook_processed", { provider: "square", granted: result.granted, reason: result.reason });
    } else if (verification.eventType === "payment.failed" && verification.orderId) {
      await markFailed("square", verification.orderId, "provider reported failure");
    } else {
      log.info("webhook_ignored", { provider: "square", event: verification.eventType });
    }

    return Response.json({ ok: true });
  } catch (error) {
    // 5xx asks Square to retry, which is correct: the money is real and the
    // customer is owed their credits.
    log.error("webhook_processing_failed", { provider: "square", error: String(error) });
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
