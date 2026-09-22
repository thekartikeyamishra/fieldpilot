import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { Legend } from "@/components/ui";
import TeamManager from "@/components/TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireSession();
  if (!can(session.role, "org:manage")) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <Legend>Organisation</Legend>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Invite your technicians and supervisors into this workspace. Each person gets their own login, so the audit
          trail shows who actually did what.
        </p>
      </div>
      <TeamManager currentUserId={session.userId} />
    </div>
  );
}
