import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { Legend } from "@/components/ui";
import ImportData from "@/components/ImportData";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await requireSession();
  // Technicians use the register; supervisors and owners maintain it.
  if (!can(session.role, "asset:write")) redirect("/assets");

  return (
    <div className="space-y-5">
      <div>
        <Legend>Context graph</Legend>
        <h1 className="text-2xl font-semibold tracking-tight">Import your data</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Load your asset register and procedures from a spreadsheet. You will see exactly what changes before anything is
          written, and re-importing a corrected file updates rows instead of duplicating them.
        </p>
      </div>
      <ImportData />
    </div>
  );
}
