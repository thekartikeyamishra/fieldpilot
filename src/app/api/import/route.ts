import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";
import { runImport, TEMPLATES, type ImportKind } from "@/server/import/importer";
import { CsvError } from "@/server/import/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 2 MB is ~20,000 asset rows — far beyond any sane single import. */
const MAX_BYTES = 2_000_000;

const schema = z.object({
  kind: z.enum(["assets", "procedures"]),
  csv: z.string().min(1).max(MAX_BYTES),
  dryRun: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!can(session.role, "asset:write")) throw new AppError("FORBIDDEN", "your role cannot import data");
    await rateLimit(`import:${session.userId}`, 30, 600);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw AppError.forUser("VALIDATION_FAILED", "Choose assets or procedures and upload a CSV under 2 MB.");
    }

    let report;
    try {
      report = await runImport({
        organizationId: session.organizationId,
        kind: parsed.data.kind,
        csv: parsed.data.csv,
        dryRun: parsed.data.dryRun,
      });
    } catch (error) {
      // Structural problems with the file are the user's to fix, so say exactly what.
      if (error instanceof CsvError || (error instanceof Error && error.message.startsWith("missing required column"))) {
        throw AppError.forUser("VALIDATION_FAILED", error.message);
      }
      throw error;
    }

    if (report.committed) {
      await recordAudit({
        organizationId: session.organizationId,
        actorType: "user",
        actorId: session.userId,
        action: `import.${parsed.data.kind}`,
        resourceType: "organization",
        resourceId: session.organizationId,
        result: "succeeded",
        metadata: { created: report.created, updated: report.updated, sitesCreated: report.sitesCreated },
      });
      await track({
        organizationId: session.organizationId,
        userId: session.userId,
        event: "data_imported",
        properties: { kind: parsed.data.kind, created: report.created, updated: report.updated },
      });
    }

    return ok(report);
  } catch (error) {
    return fail(error, { route: "import" });
  }
}

/** GET /api/import?template=assets downloads a ready-to-fill CSV. */
export async function GET(request: Request) {
  try {
    await requireSession();
    const kind = new URL(request.url).searchParams.get("template") as ImportKind | null;
    if (kind !== "assets" && kind !== "procedures") throw new AppError("VALIDATION_FAILED", "template must be assets or procedures");
    return new Response(TEMPLATES[kind], {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fieldpilot-${kind}-template.csv"`,
      },
    });
  } catch (error) {
    return fail(error, { route: "import/template" });
  }
}
