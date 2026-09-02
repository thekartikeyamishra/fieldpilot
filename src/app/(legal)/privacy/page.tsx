import type { Metadata } from "next";
import { BUSINESS, SUBPROCESSORS, addressLines } from "@/content/business";
import { Bullets, LegalHeader, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy Policy — FieldPilot" };

/**
 * This policy is written from the actual architecture. If the architecture
 * changes — a new subprocessor, a new retention period, a new data category —
 * this page changes in the same commit. A privacy policy that does not match
 * the system is worse than none.
 */
export default function PrivacyPage() {
  return (
    <>
      <LegalHeader
        title="Privacy Policy"
        subtitle="What we collect, why, who else touches it, and how to get it back or have it deleted."
      />

      <Section heading="Who is responsible">
        <p>
          {BUSINESS.legalName} operates FieldPilot and is the data fiduciary for the personal data
          described here, under India&apos;s Digital Personal Data Protection Act, 2023.
        </p>
        <div className="panel p-4">
          {addressLines().map((line) => (
            <p key={line} className="text-sm">{line}</p>
          ))}
          <p className="data mt-2 text-sm">{BUSINESS.email}</p>
        </div>
      </Section>

      <Section heading="What we collect">
        <Bullets
          items={[
            <><strong>Account data</strong> — name, work email, organisation name, role, and a hashed password. We never store your password itself.</>,
            <><strong>Operational data you create</strong> — assets, sites, incidents, measurements, procedures, work orders and outcomes.</>,
            <><strong>Voice data</strong> — audio is streamed to our speech provider during a live session and is not stored by us. The resulting transcript is stored against the session, because it is the record of what was said and why an action was taken.</>,
            <><strong>Usage and billing data</strong> — credits consumed, model calls, costs, and payment metadata such as an order reference and amount.</>,
            <><strong>Technical logs</strong> — request identifiers, timings, error codes. Account identifiers in analytics are salted-hashed, so our analytics tables contain no readable personal data.</>,
          ]}
        />
        <p className="text-sm text-[var(--muted)]">
          We do not collect Aadhaar or any national identifier, and we do not ask for card details —
          those go to Razorpay directly and never reach our servers.
        </p>
      </Section>

      <Section heading="Why we process it">
        <Bullets
          items={[
            "To provide the service: identify assets, retrieve history, generate recommendations and record approved actions.",
            "To keep an audit trail of who did what, which is a core function of the product.",
            "To meter credits, process payments and prevent abuse.",
            "To keep the service secure and diagnose failures.",
          ]}
        />
        <p>
          Our lawful basis is performance of the contract with you, together with your consent where
          the law requires it. We do not use your data for advertising and we do not sell it.
        </p>
      </Section>

      <Section heading="AI processing — stated plainly">
        <p>
          When you speak to FieldPilot, audio is streamed to AssemblyAI for transcription. The
          transcript, the identified asset and a bounded set of that asset&apos;s related records are
          then sent to an AI model provider to generate a recommendation. We deliberately send the
          minimum context needed — never your whole database.
        </p>
        <p>
          <strong>We do not use your confidential operational content to train general-purpose AI
          models.</strong> Your data is processed to answer your request and is retained under the
          periods below.
        </p>
      </Section>

      <Section heading="Who else processes your data">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left">
                <th className="legend py-2">Provider</th>
                <th className="legend py-2">Purpose</th>
                <th className="legend py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="border-b border-[var(--line)] align-top">
                  <td className="py-2 pr-3 font-medium">{s.name}</td>
                  <td className="py-2 pr-3">{s.purpose}</td>
                  <td className="py-2 text-[var(--muted)]">{s.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Some of these providers operate outside India, so your data may be processed abroad under
          contractual protections. We will not claim your data never leaves India, because that would
          not be true.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <Bullets
          items={[
            "Live audio: not retained by us. It is streamed for transcription and discarded.",
            "Transcripts, operational records and outcomes: for as long as your account is active, because they are the record your work depends on.",
            "Audit and payment records: retained after deletion where we are required to keep them for legal, tax or accounting purposes.",
            "Technical logs: a short operational window, then discarded.",
          ]}
        />
      </Section>

      <Section heading="Your rights">
        <p>Under the DPDP Act you may:</p>
        <Bullets
          items={[
            "Access the personal data we hold about you.",
            "Have inaccurate data corrected, and have data erased where we are not required to keep it.",
            "Withdraw consent where processing relies on it.",
            "Nominate someone to exercise your rights if you are unable to.",
            "Complain to us, and then to the Data Protection Board of India.",
          ]}
        />
        <p>
          You do not need to ask us for a copy: FieldPilot exports your organisation&apos;s complete
          data in one click, with checksums, from inside the product. For anything else, contact our
          Grievance Officer, {BUSINESS.grievanceOfficer.name}, at {BUSINESS.grievanceOfficer.email}.
          We respond within {BUSINESS.supportResponseTarget}.
        </p>
      </Section>

      <Section heading="Security">
        <Bullets
          items={[
            "Passwords are hashed; sessions are signed and re-verified against the database on every request.",
            "Each organisation's data is isolated at the database query layer, not merely hidden in the interface.",
            "Provider API keys stay on our servers. Your browser only receives a single-use token that expires in about a minute.",
            "Every consequential action is written to an append-only audit log.",
          ]}
        />
        <p className="text-sm text-[var(--muted)]">
          No system is perfectly secure. If we become aware of a breach affecting your personal data,
          we will notify you and the Data Protection Board as required.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          FieldPilot is a workplace tool and is not directed at anyone under 18. We do not knowingly
          collect data from children.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We will update this page when our processing changes, and will notify you of material
          changes before they take effect.
        </p>
      </Section>
    </>
  );
}
