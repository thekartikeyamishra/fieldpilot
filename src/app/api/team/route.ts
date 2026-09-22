import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";
import { createInvite, listTeam, revokeInvite, updateMember } from "@/server/team/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner() {
  const session = await requireSession();
  if (!can(session.role, "org:manage")) throw new AppError("FORBIDDEN", "only an owner manages the team");
  return session;
}

export async function GET() {
  try {
    const session = await owner();
    return ok(await listTeam(session.organizationId));
  } catch (error) {
    return fail(error, { route: "team" });
  }
}

const createSchema = z.object({
  role: z.enum(["technician", "supervisor", "admin"]),
  email: z.string().email().max(200).optional().or(z.literal("")),
});

/** Create an invite. The raw token is returned exactly once, in this response. */
export async function POST(request: Request) {
  try {
    const session = await owner();
    await rateLimit(`invite:${session.organizationId}`, 50, 3600);

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.forUser("VALIDATION_FAILED", "Choose a role, and check the email address if you entered one.");

    const invite = await createInvite({
      organizationId: session.organizationId,
      createdBy: session.userId,
      role: parsed.data.role,
      email: parsed.data.email || null,
    });

    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "team.invite.created",
      resourceType: "invite",
      resourceId: invite.id,
      result: "succeeded",
      metadata: { role: parsed.data.role, pinnedToEmail: Boolean(parsed.data.email) },
    });

    const base = env.APP_URL.replace(/\/$/, "");
    return ok({ id: invite.id, link: `${base}/signup?invite=${invite.token}`, expiresAt: invite.expiresAt });
  } catch (error) {
    return fail(error, { route: "team/invite" });
  }
}

const patchSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["technician", "supervisor", "admin"]).optional(),
  status: z.enum(["active", "deactivated"]).optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = await owner();
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (!parsed.data.role && !parsed.data.status)) {
      throw AppError.forUser("VALIDATION_FAILED", "Nothing to change.");
    }

    const result = await updateMember({
      organizationId: session.organizationId,
      actorId: session.userId,
      memberId: parsed.data.memberId,
      role: parsed.data.role,
      status: parsed.data.status,
    });

    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "team.member.updated",
      resourceType: "user",
      resourceId: parsed.data.memberId,
      result: "succeeded",
      metadata: result,
    });

    return ok(result.after);
  } catch (error) {
    return fail(error, { route: "team/member" });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await owner();
    const id = new URL(request.url).searchParams.get("invite") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw AppError.forUser("VALIDATION_FAILED", "Unknown invite.");
    const revoked = await revokeInvite(session.organizationId, id);
    if (revoked) {
      await recordAudit({
        organizationId: session.organizationId,
        actorType: "user",
        actorId: session.userId,
        action: "team.invite.revoked",
        resourceType: "invite",
        resourceId: id,
        result: "succeeded",
      });
    }
    return ok({ revoked });
  } catch (error) {
    return fail(error, { route: "team/revoke" });
  }
}
