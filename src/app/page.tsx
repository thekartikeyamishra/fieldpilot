import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, GaugeMark } from "@/components/ui";
import { getSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * The 3-5 second screen. Who it is for, what it does, what to press.
 * No feature list, no gradient, no signup wall in front of the idea.
 */
export default async function Landing() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-8">
      <header className="flex items-center gap-2">
        <GaugeMark size={26} />
        <span className="data text-sm font-semibold tracking-wide">FIELDPILOT</span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-14">
        <p className="legend">For field maintenance technicians</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Talk through the job.
          <br />
          <span className="text-[var(--muted)]">FieldPilot turns it into completed work.</span>
        </h1>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
          Say what you see. FieldPilot identifies the asset, reads its history, finds the procedure,
          and drafts the next action with the evidence behind it. You approve. It is recorded.
          Your hands stay on the job.
        </p>

        {/* The hero is the workflow itself, shown as a transcript rather than described. */}
        <div className="panel mt-9 divide-y divide-[var(--line)]">
          <TranscriptLine who="TECH" text="I'm at Site 14. Pump three is vibrating again." />
          <TranscriptLine
            who="FIELDPILOT"
            text="Pump 3. Two previous vibration incidents. Procedure MP-17 applies. What's the current pressure?"
            evidence="E1 · E2 · MP-17"
          />
          <TranscriptLine who="TECH" text="Eight point seven bar." />
          <TranscriptLine
            who="FIELDPILOT"
            text="Above the recorded range. Inspect the rear bearing before restarting. Create an urgent work order?"
            evidence="E3"
          />
          <div className="flex items-center gap-3 p-4">
            <span className="data rounded-[3px] border border-hivis-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-hivis-600">
              Approved
            </span>
            <span className="data text-sm">Work order #10482 · URGENT · recorded</span>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/signup">
            <Button size="lg">Start your first voice job</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">Sign in</Button>
          </Link>
        </div>
        <p className="legend mt-4">First real work action in under two minutes · no card</p>
      </div>

      <footer className="border-t border-[var(--line)] pt-4">
        <p className="legend">
          Built on AssemblyAI streaming speech-to-text · AI proposes, policy authorises, you approve
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {[
            { href: "/about", label: "About" },
            { href: "/pricing", label: "Pricing" },
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/refunds", label: "Refunds" },
            { href: "/contact", label: "Contact" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="legend hover:text-[var(--ink)]">
              {item.label}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}

function TranscriptLine({ who, text, evidence }: { who: string; text: string; evidence?: string }) {
  return (
    <div className="p-4">
      <span className="legend">{who}</span>
      <p className="mt-1 text-[15px] leading-snug">{text}</p>
      {evidence ? <p className="data mt-1.5 text-[11px] text-[var(--muted)]">Evidence {evidence}</p> : null}
    </div>
  );
}
