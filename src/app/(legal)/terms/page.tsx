import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/content/business";
import { Bullets, LegalHeader, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Terms of Service — FieldPilot" };

export default function TermsPage() {
  return (
    <>
      <LegalHeader title="Terms of Service" />

      <Section heading="1. Who these terms are between">
        <p>
          These terms govern your use of FieldPilot, operated by {BUSINESS.legalName} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). By creating an account you accept them. If you are accepting on behalf of
          an employer, you confirm you are authorised to do so.
        </p>
      </Section>

      <Section heading="2. Your account">
        <Bullets
          items={[
            "You must be at least 18 and able to enter a contract.",
            "Keep your credentials secure; you are responsible for activity under your account.",
            "The first user of an organisation becomes its owner and can add and remove other users.",
            "Tell us promptly at " + BUSINESS.supportEmail + " if you believe your account has been misused.",
          ]}
        />
      </Section>

      <Section heading="3. What the service does, and what it does not">
        <p>
          FieldPilot converts spoken descriptions into structured maintenance records, and generates
          recommendations from the operational data in your account.
        </p>
        <p>
          <strong>Recommendations are assistive and probabilistic.</strong> They are produced by AI
          models from the records available and may be incomplete, outdated or wrong. FieldPilot is
          not a safety system, not a certified engineering authority and not a substitute for
          qualified judgement, manufacturer instructions or applicable regulation. You remain
          responsible for every decision you take about physical equipment, and every action is
          recorded only after a human approves it.
        </p>
      </Section>

      <Section heading="4. Acceptable use">
        <p>You agree not to:</p>
        <Bullets
          items={[
            "Use the service unlawfully, or to store data you have no right to store.",
            "Attempt to access another organisation's data, or probe, scan or bypass our security controls.",
            "Circumvent credit limits, rate limits or usage controls, or automate access in a way that degrades the service.",
            "Reverse engineer, decompile or attempt to extract our models, prompts or orchestration logic, except where such a restriction is unenforceable under applicable law.",
            "Resell or provide the service to third parties without our written agreement.",
          ]}
        />
        <p>We may suspend an account that materially breaches this section, and will tell you why.</p>
      </Section>

      <Section heading="5. Your data and our platform">
        <p>
          Your operational records — assets, incidents, measurements, procedures, work orders,
          transcripts and outcomes — remain yours. We process them to provide the service, as
          described in the{" "}
          <Link href="/privacy" className="text-signal-500 underline underline-offset-4">Privacy Policy</Link>.
          We do not sell your data and do not use your confidential content to train general-purpose
          AI models.
        </p>
        <p>
          The platform itself — software, architecture, prompts, workflows and documentation —
          remains ours. Your use grants you a limited, non-exclusive, non-transferable right to use
          the service while your account is active.
        </p>
        <p>You can export everything in your account at any time, in one click.</p>
      </Section>

      <Section heading="6. Credits and payment">
        <p>
          Credits are prepaid units consumed when a request requires a paid AI model. Prices are
          shown on the{" "}
          <Link href="/pricing" className="text-signal-500 underline underline-offset-4">Pricing page</Link>{" "}
          in Indian Rupees. Purchases are one-off; nothing renews automatically. Payments are
          processed by Razorpay — we never receive or store your card details. Refunds are governed by
          the{" "}
          <Link href="/refunds" className="text-signal-500 underline underline-offset-4">Refund Policy</Link>.
        </p>
        <p>
          We may change prices for future purchases. Credits you have already bought are unaffected.
        </p>
      </Section>

      <Section heading="7. Availability">
        <p>
          We do not currently offer a contractual uptime guarantee. The service depends on third
          parties including speech and AI providers; when they are unavailable, FieldPilot degrades to
          what it can still do safely rather than failing outright, and your saved work remains
          accessible.
        </p>
      </Section>

      <Section heading="8. Warranties and liability">
        <p>
          The service is provided &ldquo;as is&rdquo;. To the extent permitted by law we exclude
          implied warranties of merchantability and fitness for a particular purpose.
        </p>
        <p>
          To the extent permitted by law, our total liability arising from the service in any twelve
          month period is limited to the amount you paid us in that period, and we are not liable for
          indirect or consequential loss, loss of profit, or loss arising from a decision taken about
          physical equipment. Nothing here limits liability that cannot lawfully be limited, including
          for fraud or for death or personal injury caused by negligence.
        </p>
      </Section>

      <Section heading="9. Termination">
        <p>
          You may stop using the service at any time and request deletion of your account by writing
          to {BUSINESS.supportEmail}. We may terminate for material breach of these terms, or if we
          discontinue the service, in which case we will give reasonable notice and a window to export
          your data.
        </p>
      </Section>

      <Section heading="10. Changes">
        <p>
          We may update these terms. Material changes will be notified in the product or by email
          before they take effect. Continued use after that constitutes acceptance.
        </p>
      </Section>

      <Section heading="11. Governing law">
        <p>
          These terms are governed by {BUSINESS.governingLaw}, and disputes are subject to{" "}
          {BUSINESS.jurisdiction}.
        </p>
      </Section>

      <Section heading="12. Contact">
        <p>{BUSINESS.legalName} · {BUSINESS.email}</p>
      </Section>
    </>
  );
}
