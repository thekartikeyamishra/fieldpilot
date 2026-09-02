import type { Metadata } from "next";
import { BUSINESS, addressLines } from "@/content/business";
import { LegalHeader, Section } from "@/components/legal";

export const metadata: Metadata = { title: "About — FieldPilot" };

export default function AboutPage() {
  return (
    <>
      <LegalHeader title="About FieldPilot" subtitle="Voice-to-work for field maintenance technicians." />

      <Section heading="What we do">
        <p>
          FieldPilot is a voice-first operations tool for technicians who work on physical equipment.
          A technician describes what they are seeing; FieldPilot identifies the asset, retrieves its
          maintenance history and the relevant procedure, and proposes the next action with the
          records that support it. The technician approves or rejects. Approved actions — work
          orders, incident reports, measurements — are written to the system and recorded with a full
          audit trail.
        </p>
        <p>
          The point is not conversation. It is that the record gets written at the moment the work
          happens, rather than hours later from memory, or not at all.
        </p>
      </Section>

      <Section heading="How we build it">
        <p>
          The AI proposes; it never decides. Every action passes through an explicit permission
          check and requires a human approval before anything is written. Recommendations cite the
          specific incidents, measurements and procedures they are based on, so a technician can
          judge the advice rather than take it on faith.
        </p>
      </Section>

      <Section heading="Who we are">
        <p>
          FieldPilot is operated by {BUSINESS.legalName}, based in India. It is an independent
          product built by a small team.
        </p>
        <div className="panel p-4">
          <p className="legend">Registered address</p>
          {addressLines().map((line) => (
            <p key={line} className="text-sm">{line}</p>
          ))}
          <p className="legend mt-3">Contact</p>
          <p className="data text-sm">{BUSINESS.email}</p>
        </div>
      </Section>

      <Section heading="A note on AI">
        <p>
          FieldPilot assists judgement; it does not replace it. Recommendations are generated from
          the records available to the system and can be incomplete or wrong. Anything involving
          safety remains the technician&apos;s decision, made with their own training and, where
          appropriate, a supervisor.
        </p>
      </Section>
    </>
  );
}
