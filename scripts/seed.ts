import "../src/lib/load-env";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/db/client";
import {
  assets, incidents, measurements, organizations, procedures, sites, users, workOrders,
} from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { ensureAccount } from "../src/server/billing/credits";

/**
 * Demo data with a real story in it: Pump 3 has a history that makes the
 * agent's recommendation obviously correct, and a decoy (Pump 30) that proves
 * the system asks instead of guessing.
 */
const DEMO_EMAIL = "demo@fieldpilot.app";
const DEMO_PASSWORD = "fieldpilot123";

async function main() {
  console.log("Seeding FieldPilot demo data…");

  // Re-runnable: an existing demo organisation is topped up rather than
  // duplicated, so upgrading the seed does not require dropping the database.
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) {
    await db
      .insert(users)
      .values([
        { organizationId: existing.organizationId, email: "owner@fieldpilot.app", name: "Dana Okafor", role: "admin", passwordHash: await hashPassword(DEMO_PASSWORD) },
        { organizationId: existing.organizationId, email: "supervisor@fieldpilot.app", name: "Priya Nair", role: "supervisor", passwordHash: await hashPassword(DEMO_PASSWORD) },
      ])
      .onConflictDoNothing();

    await ensureAccount(existing.organizationId, "free");

    console.log(`Demo organisation already present. Accounts verified:`);
    console.log(`  ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (technician)`);
    console.log(`  supervisor@fieldpilot.app / ${DEMO_PASSWORD}`);
    console.log(`  owner@fieldpilot.app / ${DEMO_PASSWORD}`);
    await sql.end();
    return;
  }

  const [org] = await db.insert(organizations).values({ name: "Northline Utilities", plan: "free" }).returning();

  const [tech] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: DEMO_EMAIL,
      name: "Alex Rivera",
      role: "technician",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    })
    .returning();

  await db.insert(users).values({
    organizationId: org.id,
    email: "owner@fieldpilot.app",
    name: "Dana Okafor",
    role: "admin",
    passwordHash: await hashPassword(DEMO_PASSWORD),
  });

  await db.insert(users).values({
    organizationId: org.id,
    email: "supervisor@fieldpilot.app",
    name: "Priya Nair",
    role: "supervisor",
    passwordHash: await hashPassword(DEMO_PASSWORD),
  });

  await ensureAccount(org.id, "free");

  const [site14, site7] = await db
    .insert(sites)
    .values([
      { organizationId: org.id, name: "Site 14", code: "S14", location: "North pumping station" },
      { organizationId: org.id, name: "Site 7", code: "S07", location: "Treatment works" },
    ])
    .returning();

  const assetRows = await db
    .insert(assets)
    .values([
      { organizationId: org.id, siteId: site14.id, name: "Pump 3", assetCode: "P-003", assetType: "pump",
        spec: { operating_pressure_bar: "6.0-8.2", bearing: "rear SKF-6208", installed: "2021-04" } },
      // Deliberate near-miss: proves the agent disambiguates rather than guessing.
      { organizationId: org.id, siteId: site14.id, name: "Pump 30", assetCode: "P-030", assetType: "pump",
        spec: { operating_pressure_bar: "5.0-7.0" } },
      { organizationId: org.id, siteId: site14.id, name: "Compressor 1", assetCode: "C-001", assetType: "compressor",
        spec: { operating_pressure_bar: "9.0-11.0" } },
      { organizationId: org.id, siteId: site14.id, name: "Valve 12", assetCode: "V-012", assetType: "valve",
        spec: { actuation: "pneumatic" } },
      { organizationId: org.id, siteId: site7.id, name: "Blower 2", assetCode: "B-002", assetType: "blower",
        spec: { duty: "continuous" } },
      { organizationId: org.id, siteId: site7.id, name: "Pump 9", assetCode: "P-009", assetType: "pump",
        spec: { operating_pressure_bar: "4.0-6.5" } },
    ])
    .returning();

  const pump3 = assetRows.find((a) => a.assetCode === "P-003")!;

  await db.insert(incidents).values([
    { organizationId: org.id, assetId: pump3.id, reportedBy: tech.id,
      title: "Vibration during morning start-up", severity: "medium", status: "resolved",
      description: "Noticeable vibration at the drive end for roughly two minutes after start. Settled on its own.",
      createdAt: daysAgo(63), resolvedAt: daysAgo(61) },
    { organizationId: org.id, assetId: pump3.id, reportedBy: tech.id,
      title: "Vibration with elevated discharge pressure", severity: "high", status: "resolved",
      description: "Vibration returned with discharge pressure reading 8.6 bar, above the recorded range. Bearing re-greased.",
      createdAt: daysAgo(24), resolvedAt: daysAgo(23) },
  ]);

  await db.insert(measurements).values([
    { organizationId: org.id, assetId: pump3.id, recordedBy: tech.id, metric: "pressure", value: "8.6", unit: "bar", source: "manual", recordedAt: daysAgo(24) },
    { organizationId: org.id, assetId: pump3.id, recordedBy: tech.id, metric: "pressure", value: "7.4", unit: "bar", source: "manual", recordedAt: daysAgo(10) },
    { organizationId: org.id, assetId: pump3.id, recordedBy: tech.id, metric: "vibration", value: "6.1", unit: "mm/s", source: "manual", recordedAt: daysAgo(24) },
  ]);

  await db.insert(procedures).values([
    { organizationId: org.id, reference: "MP-17", assetType: "pump", version: 3,
      title: "Vibration with elevated discharge pressure",
      keywords: "vibration bearing pressure noise shaking rattle knocking pump",
      content:
        "When a centrifugal pump reports vibration together with discharge pressure above the recorded operating range, " +
        "inspect the rear bearing assembly before restarting. Check lubricant for contamination and measure shaft play. " +
        "Do not restart under load if play exceeds 0.15 mm. Escalate to a supervisor where the asset has two or more " +
        "vibration incidents within 90 days." },
    { organizationId: org.id, reference: "MP-04", assetType: "pump", version: 2,
      title: "Seal leakage inspection",
      keywords: "leak seal drip weeping gland packing",
      content: "For visible leakage at the gland, isolate, depressurise and inspect the mechanical seal faces. Replace if scored." },
    { organizationId: org.id, reference: "MC-02", assetType: "compressor", version: 1,
      title: "Unexpected shutdown diagnosis",
      keywords: "stopped shutdown trip overheating compressor",
      content: "On unexpected shutdown, read the fault code, check discharge temperature and inspect the intake filter before reset." },
    { organizationId: org.id, reference: "MV-01", assetType: "valve", version: 1,
      title: "Actuator not responding",
      keywords: "valve stuck not responding actuator pneumatic",
      content: "Verify supply air at 5.5-7 bar, check solenoid continuity, then confirm the actuator stem moves freely." },
  ]);

  await db.insert(workOrders).values({
    organizationId: org.id, assetId: pump3.id, createdBy: tech.id, assignedTo: tech.id,
    title: "Quarterly lubrication - drive end", description: "Routine scheduled task.",
    priority: "low", status: "open",
  });

  console.log("\nSeed complete.");
  console.log(`  Organisation : ${org.name}`);
  console.log(`  Sign in      : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Supervisor   : supervisor@fieldpilot.app / ${DEMO_PASSWORD}`);
  console.log(`  Owner        : owner@fieldpilot.app / ${DEMO_PASSWORD}`);
  console.log('\nDemo line: "I\'m at Site 14. Pump 3 is vibrating again."\n');

  await sql.end();
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await sql.end().catch(() => {});
  process.exit(1);
});
