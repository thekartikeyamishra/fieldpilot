import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { requireSession } from "@/server/auth/session";
import { startCheckout } from "@/server/billing/purchase";
import { isSku, regionForCurrency } from "@/server/billing/catalog";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the sku is accepted. The price is ours to decide, not the client's.
// Only the sku and a currency choice. The price for that pair is ours.
const schema = z.object({
  sku: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    // Only an owner spends the organisation's money.
    if (session.role !== "admin") throw new AppError("FORBIDDEN", "only an owner can buy credits");
    await rateLimit(`checkout:${session.userId}`, 10, 300);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isSku(parsed.data.sku)) throw new AppError("VALIDATION_FAILED", "unknown pack");

    const currency = (parsed.data.currency ?? env.PAYMENTS_CURRENCY).toUpperCase();

    const checkout = await startCheckout({
      organizationId: session.organizationId,
      userId: session.userId,
      sku: parsed.data.sku,
      region: regionForCurrency(currency),
    });

    await track({
      organizationId: session.organizationId,
      userId: session.userId,
      event: "checkout_started",
      properties: { sku: parsed.data.sku, provider: checkout.provider, currency },
    });

    return ok(checkout);
  } catch (error) {
    return fail(error, { route: "billing/checkout" });
  }
}
