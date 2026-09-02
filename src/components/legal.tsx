import type { ReactNode } from "react";
import { BUSINESS } from "@/content/business";

export function LegalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b border-[var(--line)] pb-5">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-[var(--muted)]">{subtitle}</p> : null}
      <p className="legend mt-3">Effective {BUSINESS.effectiveDate}</p>
    </header>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
