import { AppError } from "@/lib/errors";
import { fail } from "@/lib/http";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";
import { track } from "@/lib/analytics";
import { exportStream } from "@/server/export/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One request, everything the organisation owns, with checksums — streamed, so
 * memory stays flat whether the tenant has ten records or ten million.
 * Portability is a product feature: it is what makes "no lock-in" true.
 */
export async function GET() {
  try {
    const session = await requireSession();
    if (!can(session.role, "data:export")) throw new AppError("FORBIDDEN", "role cannot export");

    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "data.exported",
      resourceType: "organization",
      resourceId: session.organizationId,
      result: "succeeded",
    });
    await track({ organizationId: session.organizationId, userId: session.userId, event: "data_exported" });

    const filename = `fieldpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(exportStream(session.organizationId), {
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
