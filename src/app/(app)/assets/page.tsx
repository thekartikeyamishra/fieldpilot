import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { listAssetsForOrg } from "@/server/context/resolver";
import { Button, EmptyState, Legend, Panel, Tag } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const session = await requireSession();
  const rows = await listAssetsForOrg(session.organizationId, 200);

  return (
    <div className="space-y-5">
      <div>
        <Legend>Context graph</Legend>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Everything FieldPilot can identify by name or tag when you speak.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No assets yet"
          body="FieldPilot needs at least one asset to reason about. Run the seed script, or add assets through import."
          action={
            <Link href="/job">
              <Button>Start voice job</Button>
            </Link>
          }
        />
      ) : (
        <Panel>
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="data w-20 shrink-0 text-xs text-[var(--muted)]">{a.assetCode}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="data text-[11px] text-[var(--muted)]">
                    {a.siteName} · {a.assetType}
                  </p>
                </div>
                {a.openIncidents > 0 ? <Tag tone="warn">{a.openIncidents} open</Tag> : null}
                <Tag tone={a.status === "operational" ? "ok" : "warn"}>{a.status}</Tag>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
