import type { Metadata } from "next";
import { BUSINESS } from "@/content/business";
import { Bullets, LegalHeader, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Refund & Cancellation Policy — FieldPilot" };

export default function RefundsPage() {
  return (
    <>
      <LegalHeader
        title="Refund & Cancellation Policy"
        subtitle="Short version: unused credits are refundable for seven days, consumed credits are not, and we always reverse a payment that should not have happened."
      />

      <Section heading="What you are buying">
        <p>
          FieldPilot sells credits: prepaid units consumed when a request requires a paid AI model.
          Credits are delivered to your account immediately once payment is confirmed. There is no
          subscription and no automatic renewal — nothing recurs unless you buy again.
        </p>
      </Section>

      <Section heading="Consumed credits are not refundable">
        <p>
          Once a credit has been spent, the work it paid for has been performed and the cost to us has
          been incurred with our AI providers. Those credits cannot be refunded.
        </p>
        <p>
          Because we know this in advance, the Free plan exists precisely so you can complete real
          jobs and judge the product before spending anything. Every voice turn also shows what it
          cost at the moment it happens, so credit consumption is never a surprise.
        </p>
      </Section>

      <Section heading="Unused credits">
        <p>
          Unused credits from a purchase may be refunded within {BUSINESS.refundWindowDays} days of
          that purchase. The refund covers the unused portion of that purchase, calculated at the
          price you paid per credit. Email {BUSINESS.supportEmail} with the payment reference from
          your Usage page.
        </p>
        <p>
          After {BUSINESS.refundWindowDays} days, purchased credits remain valid and do not expire,
          but they are no longer refundable.
        </p>
      </Section>

      <Section heading="We always refund these">
        <p>Regardless of the window above, we reverse a payment in full when:</p>
        <Bullets
          items={[
            "You were charged more than once for the same purchase.",
            "You were charged but no credits reached your account and we cannot deliver them.",
            "You were charged an amount other than the price shown at checkout.",
            "The payment was made without your authorisation and this is confirmed with the payment provider.",
          ]}
        />
        <p className="text-sm text-[var(--muted)]">
          If our AI provider fails after a credit has been deducted, that credit is returned to your
          balance automatically — you do not need to ask, and the reversal appears in your credit
          history. Our infrastructure failing is our cost, not yours.
        </p>
      </Section>

      <Section heading="How to request a refund">
        <Bullets
          items={[
            <>Email {BUSINESS.supportEmail} from the address on your FieldPilot account.</>,
            "Include the payment reference shown on your Usage page.",
            "Tell us briefly what happened.",
          ]}
        />
        <p>
          We respond within {BUSINESS.supportResponseTarget}. Approved refunds are issued to the
          original payment method through Razorpay and typically reach your account within 5 to 7
          working days, depending on your bank. We do not issue refunds as cash or to a different
          account.
        </p>
      </Section>

      <Section heading="Cancellation">
        <p>
          There is nothing to cancel: credit purchases are one-off and no subscription is created. You
          can stop using FieldPilot at any time, and you can delete your account by writing to{" "}
          {BUSINESS.supportEmail}. Before you do, export your data in one click from the product —
          your records are yours and leave with you in full.
        </p>
        <p>
          Deleting an account forfeits any remaining credit balance outside the refund window above.
        </p>
      </Section>

      <Section heading="If you disagree with an outcome">
        <p>
          Write to {BUSINESS.supportEmail} and we will look at it again. Nothing in this policy limits
          rights you have under the Consumer Protection Act, 2019 or other applicable Indian law.
        </p>
      </Section>
    </>
  );
}
