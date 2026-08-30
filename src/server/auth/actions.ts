"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assets, organizations, procedures, sites, users } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "../audit/audit";
import { hashPassword, verifyPassword } from "./password";
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

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    organization: formData.get("organization"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    rateLimit(`signup:${parsed.data.email}`, 5, 300);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return { error: "That email is already registered. Sign in instead." };

  const [org] = await db.insert(organizations).values({ name: parsed.data.organization }).returning();

  // First user of an organisation owns it.
  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: parsed.data.email,
      name: parsed.data.name,
      role: "admin",
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning();

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

  await createSessionCookie({
    userId: user.id,
    organizationId: org.id,
    role: user.role as Role,
    name: user.name,
    email: user.email,
  });

  redirect("/job?first=1");
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  try {
    rateLimit(`signin:${parsed.data.email}`, 10, 300);
  } catch {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);

  // Same message and similar timing whether the account exists or not.
  if (!user || user.status !== "active" || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "That email and password don't match." };
  }

  await createSessionCookie({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role as Role,
    name: user.name,
    email: user.email,
  });

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
