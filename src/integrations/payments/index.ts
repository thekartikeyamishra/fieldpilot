import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { PaymentProvider } from "./provider";
import { razorpayProvider } from "./razorpay";
import { mockProvider } from "./mock";

/**
 * Provider selection. The mock fulfils without money, so production may never
 * use it — that check is here rather than in a code review comment.
 */
export function paymentProvider(): PaymentProvider {
  if (env.PAYMENTS_PROVIDER === "razorpay") return razorpayProvider;

  if (env.NODE_ENV === "production") {
    // A clean, logged refusal rather than a 500: the guard is a policy, not a crash.
    throw new AppError(
      "FEATURE_DISABLED",
      "PAYMENTS_PROVIDER=mock is not permitted in production; configure Razorpay and set PAYMENTS_PROVIDER=razorpay",
    );
  }
  return mockProvider;
}

export type { PaymentProvider } from "./provider";
