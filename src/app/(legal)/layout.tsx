import Link from "next/link";
import { GaugeMark } from "@/components/ui";
import { BUSINESS } from "@/content/business";

const PAGES = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/contact", label: "Contact" },
];

/** These pages must stay reachable without signing in — payment providers check. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <GaugeMark size={22} />
            <span className="data text-xs font-semibold tracking-wide">FIELDPILOT</span>
          </Link>
          <nav className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
            {PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="legend hover:text-[var(--ink)]">
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="space-y-5 text-[15px] leading-relaxed">{children}</article>
      </main>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="legend">
            {BUSINESS.legalName} · {BUSINESS.email}
          </p>
        </div>
      </footer>
    </div>
  );
}
