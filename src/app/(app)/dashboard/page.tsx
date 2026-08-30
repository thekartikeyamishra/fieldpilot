import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, workOrders } from "@/db/schema";
import { requireSession } from "@/server/auth/session";
import { economics, listOutcomes } from "@/server/outcomes/ledger";
import { Button, EmptyState, Legend, Panel, Tag, priorityTone } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Not an analytics dashboard. It answers one question: what needs attention,
 * and what single action creates the most value right now.
 */
export default async function Dashboard() {
  const session = await requireSession();

  const [openWork, recentOutcomes, econ] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        title: workOrders.title,
        priority: workOrders.priority,
        status: workOrders.status,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetCode: assets.assetCode,
      })
      .from(workOrders)
      .innerJoin(assets, eq(assets.id, workOrders.assetId))
      .where(and(eq(workOrders.organizationId, session.organizationId), eq(workOrders.status, "open")))
      .orderBy(desc(workOrders.createdAt))
      .limit(5),
    listOutcomes(session.organizationId, 4),
    economics(session.organizationId),
  ]);

  const hours = (econ.minutesReturned / 60).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Legend>Signed in as {session.name}</Legend>
          <h1 className="text-2xl font-semibold tracking-tight">What needs attention</h1>
        </div>
        <Link href="/job">
          <Button size="lg">Start voice job</Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Jobs completed by voice" value={String(econ.jobs)} sub="this month" />
        <Metric label="Work time returned" value={`${hours} h`} sub={`${econ.minutesReturned} minutes`} />
        <Metric
          label="AI cost per completed job"
          value={econ.jobs ? `$${econ.costPerJobUsd.toFixed(4)}` : "—"}
          sub={`$${econ.aiCostUsd.toFixed(4)} total`}
        />
      </div>

      <Panel>
        <Legend>Open work orders</Legend>
        {openWork.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Nothing open. Speak an issue and FieldPilot will draft the work order for you.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {openWork.map((wo) => (
              <li key={wo.id} className="flex items-center gap-3 py-3">
                <span className="data text-xs text-[var(--muted)]">#{wo.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{wo.title}</p>
                  <p className="data text-[11px] text-[var(--muted)]">
                    {wo.assetName} · {wo.assetCode}
                  </p>
                </div>
                <Tag tone={priorityTone(wo.priority) as never}>{wo.priority}</Tag>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="mb-2 flex items-center justify-between">
          <Legend>Outcome ledger</Legend>
          <Link href="/work" className="legend hover:text-[var(--ink)]">See all</Link>
        </div>
        {recentOutcomes.length === 0 ? (
          <EmptyState
            title="Your first outcome starts here"
            body="Every approved action is recorded with its evidence, its duration and what it cost to produce."
            action={
              <Link href="/job">
                <Button>Start voice job</Button>
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {recentOutcomes.map((o) => (
              <li key={o.id} className="py-3">
                <p className="text-sm font-medium">{o.action}</p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{o.problemSummary}</p>
                <p className="data mt-1 text-[11px] text-[var(--muted)]">
                  {o.assetCode ?? "—"} · {o.minutesReturned} min returned · ${Number(o.aiCostUsd).toFixed(4)} AI cost
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="panel p-4">
      <p className="legend">{label}</p>
      <p className="data mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="data mt-0.5 text-[11px] text-[var(--muted)]">{sub}</p>
    </div>
  );
}
