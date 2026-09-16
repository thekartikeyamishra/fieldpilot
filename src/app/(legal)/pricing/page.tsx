import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, Section } from "@/components/legal";
import { CREDIT_PACKS, INTL_CREDIT_PACKS, formatMinor } from "@/server/billing/catalog";
import { PLANS } from "@/server/billing/plans";
import { BUSINESS } from "@/content/business";

export const metadata: Metadata = { title: "Pricing — FieldPilot" };

/** Public and reachable without an account — payment providers verify this. */
export default function PricingPage() {
  return (
    <>
      <LegalHeader title="Pricing" subtitle="Pay for the work the product does, not for permission to try it." />

      <Section heading="Free to start">
        <p>
          Every account begins on the Free plan with {PLANS.free.creditsPerPeriod} credits each month.
          No card, no trial countdown. You see the product complete real work before anything is asked
          of you.
        </p>
      </Section>

      <Section heading="What a credit is">
        <p>
          A credit is spent only when answering you requires a paid AI model. Straightforward
          instructions — logging a reading, repeating a question already answered in the session —
          are handled without a model and cost nothing. A routine question costs 1 credit; a
          diagnostic question that needs deeper reasoning costs 2.
        </p>
        <p>
          Reading your asset history, viewing procedures, creating and approving work orders,
          exporting your data and everything else in the product are unlimited and free.
        </p>
      </Section>

      <Section heading="Credit packs">
        <ul className="divide-y divide-[var(--line)]">
          {Object.values(CREDIT_PACKS).map((pack) => (
            <li key={pack.sku} className="flex items-center gap-4 py-3">
              <span className="data flex-1 text-sm">{pack.credits.toLocaleString()} credits</span>
              <span className="data text-sm">{formatMinor(pack.amountMinor, pack.currency)}</span>
              <span className="data text-[11px] text-[var(--muted)]">
                {formatMinor(Math.round(pack.amountMinor / pack.credits), pack.currency)} each
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--muted)]">
          Prices are in Indian Rupees and include applicable taxes where charged. Credits are
          purchased once — there is no automatic renewal and no recurring charge. Purchased credits
          do not expire.
        </p>
      </Section>

      <Section heading="What you can see about your own spend">
        <p>
          The Usage page shows credits remaining, what was consumed, how many jobs were completed and
          how much work time that represents. Every voice turn displays what it cost at the moment it
          happens. We would rather you could audit us than trust us.
        </p>
      </Section>

      <Section heading="Refunds">
        <p>
          Unused credits can be refunded within {BUSINESS.refundWindowDays} days of purchase. See the{" "}
          <Link href="/refunds" className="text-signal-500 underline underline-offset-4">
            refund policy
          </Link>{" "}
          for the details.
        </p>
      </Section>
    </>
  );
}
