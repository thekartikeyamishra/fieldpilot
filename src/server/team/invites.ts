import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { invites, organizations, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { Role } from "../policy/roles";

/**
 * Team management: inviting people into an organisation and removing them.
 *
 * The rules below each exist because the alternative fails in a specific way:
 *
 *   - Tokens are 256 bits and only their hash is stored. A database backup is
 *     not a bag of working invite links.
 *   - Consuming an invite is one atomic UPDATE with every condition in its WHERE
 *     clause. Two people clicking the same link at the same moment cannot both
 *     join — exactly one row changes.
 *   - An organisation can never be left without an active owner. Deactivating
 *     or demoting the last admin is refused, because the result is a workspace
 *     nobody can manage, pay for, or export — and support cannot safely fix it.
 *   - Nobody can deactivate themselves. It is always a mistake, and it is the
 *     easiest way to lock yourself out of your own company's records.
 */

export const INVITE_TTL_DAYS = 7;
export const INVITABLE_ROLES: Role[] = ["technician", "supervisor", "admin"];

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function createInvite(input: {
  organizationId: string;
  createdBy: string;
  role: Role;
  email?: string | null;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  if (!INVITABLE_ROLES.includes(input.role)) throw AppError.forUser("VALIDATION_FAILED", "Choose technician, supervisor or owner.");

  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const [existing] = await db.select({ organizationId: users.organizationId }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      throw AppError.forUser(
        "CONFLICT",
        existing.organizationId === input.organizationId
          ? "That person is already in your team."
          : "That email already has a FieldPilot account in another organisation. They need to use a different email.",
      );
    }
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  const [row] = await db
    .insert(invites)
    .values({ organizationId: input.organizationId, role: input.role, email, tokenHash: hashToken(token), createdBy: input.createdBy, expiresAt })
    .returning({ id: invites.id });

  return { id: row.id, token, expiresAt };
}

export type InvitePreview = { organizationName: string; role: Role; email: string | null };

/** What the signup page shows before the person commits. Never reveals why an invite is invalid. */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ role: invites.role, email: invites.email, organizationName: organizations.name })
    .from(invites)
    .innerJoin(organizations, eq(organizations.id, invites.organizationId))
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
    .limit(1);
  return row ? { organizationName: row.organizationName, role: row.role as Role, email: row.email } : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Claims an invite inside the caller's transaction. Returns the organisation and
 * role on success; null if the invite is used, revoked, expired, or pinned to a
 * different email. Every condition lives in the WHERE clause so the claim is
 * atomic under concurrency.
 */
export async function claimInvite(tx: Tx, token: string, email: string): Promise<{ organizationId: string; role: Role; inviteId: string } | null> {
  const rows = await tx
    .update(invites)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        raw`(${invites.email} is null or ${invites.email} = ${email.toLowerCase()})`,
      ),
    )
    .returning({ id: invites.id, organizationId: invites.organizationId, role: invites.role });

  const row = rows[0];
  return row ? { organizationId: row.organizationId, role: row.role as Role, inviteId: row.id } : null;
}

export async function listTeam(organizationId: string) {
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(users.createdAt);

  const pending = await db
    .select({ id: invites.id, role: invites.role, email: invites.email, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(eq(invites.organizationId, organizationId), isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));

  return { members, pending };
}

export async function revokeInvite(organizationId: string, inviteId: string): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.organizationId, organizationId), isNull(invites.usedAt), isNull(invites.revokedAt)))
    .returning({ id: invites.id });
  return rows.length > 0;
}

/**
 * Change a member's role or status. The last-owner rule is enforced inside a
 * transaction with a per-organisation lock, so two owners cannot demote each
 * other at the same moment and leave the organisation ownerless.
 */
export async function updateMember(input: {
  organizationId: string;
  actorId: string;
  memberId: string;
  role?: Role;
  status?: "active" | "deactivated";
}) {
  if (input.memberId === input.actorId && input.status === "deactivated") {
    throw AppError.forUser("VALIDATION_FAILED", "You can't deactivate yourself. Ask another owner to do it.");
  }
  if (input.memberId === input.actorId && input.role && input.role !== "admin") {
    throw AppError.forUser("VALIDATION_FAILED", "You can't remove your own owner role. Ask another owner to do it.");
  }
  if (input.role && !INVITABLE_ROLES.includes(input.role)) throw AppError.forUser("VALIDATION_FAILED", "Unknown role.");

  return db.transaction(async (tx) => {
    await tx.execute(raw`select pg_advisory_xact_lock(hashtext(${`team:${input.organizationId}`}))`);

    const [member] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.memberId), eq(users.organizationId, input.organizationId)))
      .limit(1);
    if (!member) throw new AppError("NOT_FOUND", "member not found in this organisation");

    const losingOwner =
      member.role === "admin" && member.status === "active" && (input.status === "deactivated" || (input.role && input.role !== "admin"));

    if (losingOwner) {
      const [{ count }] = (await tx
        .select({ count: raw<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.organizationId, input.organizationId), eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, member.id)))) as Array<{ count: number }>;
      if (Number(count) === 0) {
        throw AppError.forUser("CONFLICT", "This is the only active owner. Make someone else an owner first.");
      }
    }

    const [updated] = await tx
      .update(users)
      .set({ ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) })
      .where(eq(users.id, member.id))
      .returning({ id: users.id, role: users.role, status: users.status });

    return { before: { role: member.role, status: member.status }, after: updated };
  });
}
