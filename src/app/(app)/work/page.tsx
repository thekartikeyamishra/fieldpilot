import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, workOrders } from "@/db/schema";
import { requireSession } from "@/server/auth/session";
import { ATTRIBUTION_BASIS, economics, listOutcomes } from "@/server/outcomes/ledger";
import { Legend, Panel, Tag, priorityTone } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Work orders and the ledger that proves what the product actually returned. */
export default async function WorkPage() {
  const session = await requireSession();

  const [orders, outcomes, econ] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetCode: assets.assetCode,
      })
      .from(workOrders)
      .innerJoin(assets, eq(assets.id, workOrders.assetId))
      .where(eq(workOrders.organizationId, session.organizationId))
      .orderBy(desc(workOrders.createdAt))
      .limit(50),
    listOutcomes(session.organizationId, 25),
    economics(session.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Legend>Verified work</Legend>
          <h1 className="text-2xl font-semibold tracking-tight">Work &amp; outcomes</h1>
        </div>
        <a href="/api/export" className="legend underline underline-offset-4 hover:text-[var(--ink)]">
          Export everything
        </a>
      </div>

      <Panel>
        <Legend>Work orders</Legend>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            No work orders yet. Start a voice job and approve the first draft.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {orders.map((wo) => (
              <li key={wo.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="data text-xs text-[var(--muted)]">#{wo.number}</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{wo.title}</p>
                  <Tag tone={priorityTone(wo.priority) as never}>{wo.priority}</Tag>
                  <Tag tone={wo.status === "completed" ? "ok" : "neutral"}>{wo.status}</Tag>
                </div>
                <p className="data mt-1 text-[11px] text-[var(--muted)]">
                  {wo.assetName} · {wo.assetCode} · {wo.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <Legend>Outcome ledger · {econ.minutesReturned} minutes returned this month</Legend>
        {outcomes.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Approved actions appear here with their evidence and cost.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {outcomes.map((o) => (
              <li key={o.id} className="py-3">
                <p className="text-sm font-medium">{o.action}</p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{o.problemSummary}</p>
                {o.recommendation ? (
                  <p className="mt-1 text-sm">
                    <span className="legend">Recommended </span>
                    {o.recommendation}
                  </p>
                ) : null}
                <p className="data mt-1 text-[11px] text-[var(--muted)]">
                  {o.assetCode ?? "—"}
                  {o.workOrderNumber ? ` · WO #${o.workOrderNumber}` : ""} · {Math.round(o.durationMs / 1000)}s session ·{" "}
                  {o.minutesReturned} min returned · ${Number(o.aiCostUsd).toFixed(4)} AI cost
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
          <span className="legend">How this is counted </span>
          {ATTRIBUTION_BASIS}
        </p>
      </Panel>
    </div>
  );
}
