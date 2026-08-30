import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationEvents, toolCalls, voiceSessions } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { executeApproved } from "@/server/tools/gateway";
import { recordOutcome } from "@/server/outcomes/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  toolCallId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  problemSummary: z.string().max(400).optional(),
  recommendation: z.string().max(600).optional(),
  evidence: z.array(z.unknown()).max(10).optional(),
});

/** The human tap. Nothing consequential happens anywhere else. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    rateLimit(`tool-exec:${session.userId}`, 40, 60);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "bad approval payload");

    const result = await executeApproved({
      session,
      toolCallId: parsed.data.toolCallId,
      decision: parsed.data.decision,
    });

    if ("rejected" in result) return ok({ rejected: true });

    // Record the outcome only for real work, and only once per tool call.
    let outcome = null;
    if (env.FEATURE_OUTCOME_LEDGER && !result.duplicate) {
      const [call] = await db
        .select()
        .from(toolCalls)
        .where(and(eq(toolCalls.id, result.toolCallId), eq(toolCalls.organizationId, session.organizationId)))
        .limit(1);

      if (call?.sessionId) {
        const [vs] = await db.select().from(voiceSessions).where(eq(voiceSessions.id, call.sessionId)).limit(1);
        const workOrder = (result.data.workOrder ?? null) as { id?: string } | null;

        outcome = await recordOutcome({
          organizationId: session.organizationId,
          sessionId: call.sessionId,
          assetId: vs?.assetId ?? null,
          workOrderId: workOrder?.id ?? null,
          problemSummary: parsed.data.problemSummary ?? (await lastTechnicianLine(call.sessionId)),
          recommendation: parsed.data.recommendation ?? "",
          action: result.summary,
          toolName: result.toolName,
          evidence: parsed.data.evidence ?? [],
          durationMs: vs ? Date.now() - vs.startedAt.getTime() : 0,
        });
      }
    }

    return ok({
      executed: true,
      duplicate: result.duplicate,
      summary: result.summary,
      data: result.data,
      outcome,
    });
  } catch (error) {
    return fail(error, { route: "tools/execute" });
  }
}

async function lastTechnicianLine(sessionId: string): Promise<string> {
  const rows = await db
    .select()
    .from(conversationEvents)
    .where(and(eq(conversationEvents.sessionId, sessionId), eq(conversationEvents.speaker, "technician")))
    .limit(20);
  return rows.at(-1)?.content ?? "Voice-reported issue";
}
