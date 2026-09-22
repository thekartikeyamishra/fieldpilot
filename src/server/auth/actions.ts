"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assets, invites, organizations, procedures, sites, users } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "../audit/audit";
import { track } from "@/lib/analytics";
import { ensureAccount } from "../billing/credits";
import { hashPassword } from "./password";
import { claimInvite } from "../team/invites";
import { authenticate } from "./authenticate";
import { createSessionCookie, destroySession } from "./session";
import type { Role } from "../policy/roles";

export type AuthState = { error?: string } | null;

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

const signupSchema = credentials.extend({
  name: z.string().min(2, "Enter your name").max(80),
  organization: z.string().min(2, "Enter your organisation").max(80),
});

const inviteSignupSchema = credentials.extend({
  name: z.string().min(2, "Enter your name").max(80),
  invite: z.string().min(20).max(200),
});

/** Postgres unique violation — two signups for one email racing each other. */
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && ((error as { code?: string }).code === "23505" || String((error as { cause?: { code?: string } }).cause?.code) === "23505");

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  // An invite link joins an existing organisation instead of creating one.
  if (formData.get("invite")) return joinWithInvite(formData);

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    organization: formData.get("organization"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await rateLimit(`signup:${parsed.data.email}`, 5, 300);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return { error: "That email is already registered. Sign in instead." };

  const passwordHash = await hashPassword(parsed.data.password);

  // Organisation and owner are created together. Without the transaction, a
  // failure after the first insert leaves an organisation that nobody owns.
  let org: typeof organizations.$inferSelect;
  let user: typeof users.$inferSelect;
  try {
    ({ org, user } = await db.transaction(async (tx) => {
      const [o] = await tx.insert(organizations).values({ name: parsed.data.organization }).returning();
      // First user of an organisation owns it.
      const [u] = await tx
        .insert(users)
        .values({ organizationId: o.id, email: parsed.data.email, name: parsed.data.name, role: "admin", passwordHash })
        .returning();
      return { org: o, user: u };
    }));
  } catch (error) {
    // The existence check above cannot stop two simultaneous signups for the
    // same email; the unique index does, and this turns it into a clear message
    // rather than a 500.
    if (isUniqueViolation(error)) return { error: "That email is already registered. Sign in instead." };
    throw error;
  }

  await ensureAccount(org.id, "free");
  await seedStarterSite(org.id);

  await recordAudit({
    organizationId: org.id,
    actorType: "user",
    actorId: user.id,
    action: "auth.signup",
    resourceType: "user",
    resourceId: user.id,
    result: "succeeded",
  });

  await track({ organizationId: org.id, userId: user.id, event: "signup_completed" });

  await createSessionCookie({
    userId: user.id,
    organizationId: org.id,
    role: user.role as Role,
    name: user.name,
    email: user.email,
  });

  redirect("/job?first=1");
}

async function joinWithInvite(formData: FormData): Promise<AuthState> {
  const parsed = inviteSignupSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
    invite: String(formData.get("invite") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await rateLimit(`signup:${parsed.data.email}`, 5, 300);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  let joined: { user: typeof users.$inferSelect; organizationId: string } | null = null;
  try {
    joined = await db.transaction(async (tx) => {
      const claim = await claimInvite(tx, parsed.data.invite, parsed.data.email);
      if (!claim) return null;
      const [u] = await tx
        .insert(users)
        .values({ organizationId: claim.organizationId, email: parsed.data.email, name: parsed.data.name, role: claim.role, passwordHash })
        .returning();
      await tx.update(invites).set({ usedBy: u.id }).where(eq(invites.id, claim.inviteId));
      return { user: u, organizationId: claim.organizationId };
    });
  } catch (error) {
    // The transaction rolled back, so the invite is still unused and can be
    // retried with a different email.
    if (isUniqueViolation(error)) return { error: "That email already has an account. Sign in, or use a different email." };
    throw error;
  }

  // One message for every failure mode on purpose: telling a stranger whether a
  // token exists, expired, or belongs to someone else helps them probe for one.
  if (!joined) {
    return { error: "This invite link is no longer valid. Ask whoever invited you for a new one — and check you used the email it was sent to." };
  }

  await recordAudit({
    organizationId: joined.organizationId,
    actorType: "user",
    actorId: joined.user.id,
    action: "team.joined",
    resourceType: "user",
    resourceId: joined.user.id,
    result: "succeeded",
    metadata: { role: joined.user.role },
  });
  await track({ organizationId: joined.organizationId, userId: joined.user.id, event: "signup_completed", properties: { via: "invite" } });

  await createSessionCookie({
    userId: joined.user.id,
    organizationId: joined.organizationId,
    role: joined.user.role as Role,
    name: joined.user.name,
    email: joined.user.email,
  });

  redirect("/job?first=1");
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  let session;
  try {
    session = await authenticate(parsed.data.email, parsed.data.password);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  if (!session) return { error: "That email and password don't match." };

  await createSessionCookie(session);
  redirect("/dashboard");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

/**
 * A new organisation gets one site, three assets and one procedure so the very
 * first voice turn has something real to reason over. An empty database is the
 * fastest way to lose a new user.
 */
async function seedStarterSite(organizationId: string) {
  const [site] = await db
    .insert(sites)
    .values({ organizationId, name: "Site 14", code: "S14", location: "Main plant" })
    .returning();

  await db.insert(assets).values([
    { organizationId, siteId: site.id, name: "Pump 3", assetCode: "P-003", assetType: "pump",
      spec: { operating_pressure_bar: "6.0-8.2", bearing: "rear SKF-6208" } },
    { organizationId, siteId: site.id, name: "Compressor 1", assetCode: "C-001", assetType: "compressor",
      spec: { operating_pressure_bar: "9.0-11.0" } },
    { organizationId, siteId: site.id, name: "Valve 12", assetCode: "V-012", assetType: "valve",
      spec: { actuation: "pneumatic" } },
  ]);

  await db.insert(procedures).values({
    organizationId,
    reference: "MP-17",
    assetType: "pump",
    title: "Vibration with elevated discharge pressure",
    version: 3,
    keywords: "vibration bearing pressure noise pump shaking rattle",
    content:
      "When a centrifugal pump reports vibration together with discharge pressure above the recorded operating range, " +
      "inspect the rear bearing assembly before restarting. Check for lubricant contamination and shaft play. " +
      "Do not restart under load if play exceeds 0.15 mm. Escalate to a supervisor if the pump has two or more " +
      "vibration incidents in the preceding 90 days.",
  });
}
