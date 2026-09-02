import type { Metadata } from "next";
import { BUSINESS, addressLines } from "@/content/business";
import { LegalHeader, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Contact — FieldPilot" };

export default function ContactPage() {
  return (
    <>
      <LegalHeader title="Contact us" />

      <Section heading="Support and general enquiries">
        <div className="panel p-4">
          <p className="legend">Email</p>
          <p className="data text-sm">{BUSINESS.supportEmail}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            We aim to reply within {BUSINESS.supportResponseTarget}.
          </p>
        </div>
        <p>
          If you are writing about a payment, include the payment reference shown on your Usage page.
          If you are writing about an error, include the request ID from the message you saw — every
          error we show carries one, and it lets us find exactly what happened.
        </p>
      </Section>

      <Section heading="Data protection">
        <p>
          For questions about your personal data, or to exercise your rights under the Digital
          Personal Data Protection Act, 2023, contact our Grievance Officer:
        </p>
        <div className="panel p-4">
          <p className="text-sm">{BUSINESS.grievanceOfficer.name}, Grievance Officer</p>
          <p className="data text-sm">{BUSINESS.grievanceOfficer.email}</p>
        </div>
      </Section>

      <Section heading="Postal address">
        <div className="panel p-4">
          <p className="text-sm">{BUSINESS.legalName}</p>
          {addressLines().map((line) => (
            <p key={line} className="text-sm">{line}</p>
          ))}
        </div>
      </Section>
    </>
  );
}
