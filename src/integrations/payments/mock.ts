import { randomUUID } from "node:crypto";
import type { CreateOrderInput, PaymentProvider, ProviderOrder, WebhookVerification } from "./provider";

/**
 * Development provider. Fulfils immediately so the whole purchase path —
 * order, grant, ledger, receipt — can be exercised without payment keys and
 * without anyone's card. It is refused in production by the selector.
 */
class MockProvider implements PaymentProvider {
  readonly name = "mock";

  isConfigured() {
    return true;
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    return {
      orderId: `mock_order_${randomUUID().slice(0, 12)}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      publicKey: "mock_key",
      autoFulfils: true,
    };
  }

  verifyWebhook(): WebhookVerification {
    return { valid: false, reason: "the mock provider does not accept webhooks" };
  }
}

export const mockProvider = new MockProvider();
