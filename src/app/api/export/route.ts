import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assets, auditEvents, conversationEvents, incidents, measurements,
  organizations, outcomes, procedures, sites, toolCalls, users, voiceSessions, workOrders,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { fail } from "@/lib/http";
import { sha256 } from "@/lib/ids";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One request, everything the organisation owns, with checksums.
 * Portability is a product feature: it is what makes "no lock-in" true.
 */
export async function GET() {
  try {
    const session = await requireSession();
    if (!can(session.role, "data:export")) throw new AppError("FORBIDDEN", "role cannot export");

    const org = session.organizationId;

    const [orgRows, userRows, siteRows, assetRows, incidentRows, measurementRows,
      procedureRows, workOrderRows, sessionRows, eventRows, toolRows, outcomeRows, auditRows] =
      await Promise.all([
        db.select().from(organizations).where(eq(organizations.id, org)),
        db.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt })
          .from(users).where(eq(users.organizationId, org)),
        db.select().from(sites).where(eq(sites.organizationId, org)),
        db.select().from(assets).where(eq(assets.organizationId, org)),
        db.select().from(incidents).where(eq(incidents.organizationId, org)),
        db.select().from(measurements).where(eq(measurements.organizationId, org)),
        db.select().from(procedures).where(eq(procedures.organizationId, org)),
        db.select().from(workOrders).where(eq(workOrders.organizationId, org)),
        db.select().from(voiceSessions).where(eq(voiceSessions.organizationId, org)),
        db.select().from(conversationEvents).where(eq(conversationEvents.organizationId, org)),
        db.select().from(toolCalls).where(eq(toolCalls.organizationId, org)),
        db.select().from(outcomes).where(eq(outcomes.organizationId, org)),
        db.select().from(auditEvents).where(eq(auditEvents.organizationId, org)),
      ]);

    // Password hashes are deliberately excluded above: an export is not a credential dump.
    const entities: Record<string, unknown[]> = {
      organizations: orgRows,
      users: userRows,
      sites: siteRows,
      assets: assetRows,
      incidents: incidentRows,
      measurements: measurementRows,
      procedures: procedureRows,
      work_orders: workOrderRows,
      voice_sessions: sessionRows,
      conversation_events: eventRows,
      tool_calls: toolRows,
      outcomes: outcomeRows,
      audit_events: auditRows,
    };

    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const [name, rows] of Object.entries(entities)) {
      checksums[name] = sha256(JSON.stringify(rows));
      counts[name] = rows.length;
    }

    const payload = {
      manifest: {
        exportVersion: 1,
        productVersion: "0.1.0",
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        organizationId: org,
        entityCounts: counts,
        checksumAlgorithm: "sha256",
        checksums,
      },
      entities,
    };

    await recordAudit({
      organizationId: org,
      actorType: "user",
      actorId: session.userId,
      action: "data.exported",
      resourceType: "organization",
      resourceId: org,
      result: "succeeded",
      metadata: { counts },
    });

    const filename = `fieldpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error, { route: "export" });
  }
}
