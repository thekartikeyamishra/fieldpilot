/**
 * The payment abstraction. Business logic never imports a provider SDK, so
 * adding Stripe for non-Indian customers is a new adapter, not a rewrite.
 */
export type CreateOrderInput = {
  amountMinor: number;
  currency: string;
  /** Our own reference, echoed back by the provider. */
  receipt: string;
  notes?: Record<string, string>;
};

export type ProviderOrder = {
  orderId: string;
  amountMinor: number;
  currency: string;
  /** Public key the browser needs to open checkout. Never the secret. */
  publicKey: string;
  /** True when the provider fulfils immediately without a real payment (dev only). */
  autoFulfils: boolean;
  /**
   * Hosted checkout page to send the buyer to. Razorpay opens in-page with the
   * public key; Square hands back a URL. Both shapes fit here so the caller
   * does not branch on provider name.
   */
  checkoutUrl?: string;
};

export type WebhookVerification =
  | { valid: true; eventId: string; eventType: string; orderId: string | null; paymentId: string | null; amountMinor: number | null }
  | { valid: false; reason: string };

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  /** Verifies the signature over the raw body. Never parse before verifying. */
  verifyWebhook(rawBody: string, signature: string | null): WebhookVerification;
}
