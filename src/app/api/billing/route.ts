import { fail, ok } from "@/lib/http";
import { requireSession } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/credits";
import { PLANS } from "@/server/billing/plans";
import { CREDIT_PACKS } from "@/server/billing/catalog";
import { listPayments, paymentsEnabled } from "@/server/billing/purchase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const summary = await billingSummary(session.organizationId);
    const history = session.role === "admin" ? await listPayments(session.organizationId, 10) : [];

    // Unit economics are the owner's business, not every technician's.
    const isOwner = session.role === "admin";

    return ok({
      plan: summary.plan,
      balance: summary.balance,
      includedPerPeriod: summary.includedPerPeriod,
      creditsConsumed: summary.creditsConsumed,
      jobsCompleted: summary.jobsCompleted,
      minutesReturned: summary.minutesReturned,
      plans: Object.values(PLANS),
      packs: Object.values(CREDIT_PACKS),
      paymentsEnabled: paymentsEnabled(),
      canPurchase: session.role === "admin",
      payments: history.map((p) => ({
        id: p.id,
        sku: p.sku,
        status: p.status,
        amountMinor: p.amountMinor,
        currency: p.currency,
        creditsGranted: p.creditsGranted,
        createdAt: p.createdAt,
      })),
      economics: isOwner ? summary.economics : undefined,
      efficiency: isOwner ? { modelCalls: summary.modelCalls, cacheHits: summary.cacheHits } : undefined,
    });
  } catch (error) {
    return fail(error, { route: "billing" });
  }
}
