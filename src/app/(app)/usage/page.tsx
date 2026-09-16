import { requireSession } from "@/server/auth/session";
import { billingSummary } from "@/server/billing/credits";
import { PLANS } from "@/server/billing/plans";
import { ATTRIBUTION_BASIS } from "@/server/outcomes/attribution";
import { Legend, Panel, Tag } from "@/components/ui";
import BuyCredits from "@/components/BuyCredits";
import { CREDIT_PACKS, INTL_CREDIT_PACKS, formatMinor } from "@/server/billing/catalog";
import { listPayments, paymentsEnabled } from "@/server/billing/purchase";

export const dynamic = "force-dynamic";

/**
 * The value receipt. Every paying customer should be able to answer
 * "what did I get for this?" without asking anyone.
 */
export default async function UsagePage() {
  const session = await requireSession();
  const summary = await billingSummary(session.organizationId);
  const isOwner = session.role === "admin";
  const history = isOwner ? await listPayments(session.organizationId, 5) : [];

  const used = summary.includedPerPeriod - summary.balance;
  const usedPct = summary.includedPerPeriod > 0 ? Math.min(100, (used / summary.includedPerPeriod) * 100) : 0;
  const hours = (summary.minutesReturned / 60).toFixed(1);
  const plan = PLANS[summary.plan === "pro" ? "pro" : "free"];

  return (
    <div className="space-y-6">
      <div>
        <Legend>This month</Legend>
        <h1 className="text-2xl font-semibold tracking-tight">Usage &amp; value</h1>
      </div>

      <Panel>
        <div className="flex items-center justify-between">
          <Legend>Credits</Legend>
          <Tag tone={summary.balance > 0 ? "ok" : "warn"}>{plan.label} plan</Tag>
        </div>
        <p className="data mt-1 text-3xl font-semibold tracking-tight">
          {summary.balance}
          <span className="text-base font-normal text-[var(--muted)]"> of {summary.includedPerPeriod} left</span>
        </p>

        <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--line)]">
          <div className="h-full bg-signal-500" style={{ width: `${usedPct}%` }} />
        </div>

        <p className="mt-3 text-sm text-[var(--muted)]">
          A credit is spent only when a question needs a paid model. Deterministic readings, repeated
          questions and answers served from context cost nothing — {summary.creditsConsumed} credits
          used across {summary.jobsCompleted} completed jobs.
        </p>
        <p className="legend mt-2">Resets on the 1st · unused credits do not roll over</p>
      </Panel>

      <Panel>
        <Legend>What came back</Legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure label="Jobs completed by voice" value={String(summary.jobsCompleted)} />
          <Figure label="Work time returned" value={`${hours} h`} sub={`${summary.minutesReturned} minutes`} />
          <Figure
            label="Credits per completed job"
            value={summary.jobsCompleted ? (summary.creditsConsumed / summary.jobsCompleted).toFixed(1) : "—"}
          />
        </div>
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
          <span className="legend">How this is counted </span>
          {ATTRIBUTION_BASIS}
        </p>
      </Panel>

      {isOwner && summary.economics ? (
        <Panel>
          <div className="flex items-center justify-between">
            <Legend>Unit economics · visible to owners only</Legend>
            <Tag tone={summary.economics.healthy ? "ok" : "danger"}>
              {summary.economics.healthy ? "contribution positive" : "review pricing"}
            </Tag>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Figure label="Credit revenue" value={`$${summary.economics.revenueUsd.toFixed(3)}`} />
            <Figure label="Variable AI cost" value={`$${summary.economics.variableCostUsd.toFixed(4)}`} />
            <Figure label="Contribution" value={`$${summary.economics.contributionUsd.toFixed(3)}`} />
            <Figure label="Margin" value={`${summary.economics.contributionMarginPct.toFixed(0)}%`} />
          </div>
          <p className="data mt-4 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">
            {summary.modelCalls} model calls · {summary.cacheHits} served from cache · rule and cache
            paths were free to serve
          </p>
        </Panel>
      ) : null}

      {isOwner ? (
        <Panel>
          <Legend>Top up</Legend>
          <BuyCredits packs={Object.values(CREDIT_PACKS)} intlPacks={Object.values(INTL_CREDIT_PACKS)} enabled={paymentsEnabled()} />
          {history.length ? (
            <ul className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {history.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="data text-xs text-[var(--muted)]">
                    {p.createdAt.toISOString().slice(0, 10)}
                  </span>
                  <span className="flex-1 text-sm">{p.creditsGranted || 0} credits</span>
                  <span className="data text-sm">{formatMinor(p.amountMinor, p.currency)}</span>
                  <Tag tone={p.status === "paid" ? "ok" : p.status === "failed" ? "danger" : "neutral"}>
                    {p.status}
                  </Tag>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      <Panel>
        <Legend>Plans</Legend>
        <ul className="divide-y divide-[var(--line)]">
          {Object.values(PLANS).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="data text-[11px] text-[var(--muted)]">{p.creditsPerPeriod} credits per month</p>
              </div>
              <span className="data text-sm">{p.priceUsd === 0 ? "Free" : `$${p.priceUsd}/mo`}</span>
              {p.id === summary.plan ? <Tag tone="ok">current</Tag> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--muted)]">
          You are never blocked before you have seen the product work. Running out of credits degrades
          to evidence-only answers — your history, procedures and records stay fully available, and
          nothing you have done is lost.
        </p>
      </Panel>
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="legend">{label}</p>
      <p className="data mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub ? <p className="data text-[11px] text-[var(--muted)]">{sub}</p> : null}
    </div>
  );
}
