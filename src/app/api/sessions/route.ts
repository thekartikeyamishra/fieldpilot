import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { voiceSessions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";
import { endSession } from "@/server/workflow/orchestrator";
import { env } from "@/lib/env";
import { lt, sql as raw } from "drizzle-orm";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  siteId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!can(session.role, "voice:use")) throw new AppError("FORBIDDEN", "role cannot use voice");
    await rateLimit(`session-create:${session.userId}`, 30, 60);

    const body = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) throw new AppError("VALIDATION_FAILED", "bad session payload");

    // A browser that closes without ending its session would otherwise leave an
    // "active" row forever, and the resume rule below would hand the technician
    // back a dead session on every attempt. Expire the stale ones first.
    await db
      .update(voiceSessions)
      .set({ status: "ended", endedAt: new Date(), failureReason: "expired: exceeded max duration" })
      .where(
        and(
          eq(voiceSessions.userId, session.userId),
          eq(voiceSessions.status, "active"),
          lt(voiceSessions.startedAt, new Date(Date.now() - env.VOICE_SESSION_MAX_SECONDS * 1000)),
        ),
      );

    // One active session per technician: reconnecting resumes rather than forking.
    const [existing] = await db
      .select()
      .from(voiceSessions)
      .where(and(eq(voiceSessions.userId, session.userId), eq(voiceSessions.status, "active")))
      .limit(1);

    if (existing) {
      return ok({ sessionId: existing.id, resumed: true, startedAt: existing.startedAt });
    }

    const [row] = await db
      .insert(voiceSessions)
      .values({
        organizationId: session.organizationId,
        userId: session.userId,
        siteId: body.data.siteId ?? null,
        assetId: body.data.assetId ?? null,
        status: "active",
        provider: "assemblyai",
      })
      .returning();

    await track({ organizationId: session.organizationId, userId: session.userId, event: "voice_session_started" });

    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "voice.session.started",
      resourceType: "voice_session",
      resourceId: row.id,
      result: "succeeded",
    });

    return ok({ sessionId: row.id, resumed: false, startedAt: row.startedAt });
  } catch (error) {
    return fail(error, { route: "sessions:create" });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("id");
    if (!sessionId) throw new AppError("VALIDATION_FAILED", "id required");

    await endSession(session.organizationId, sessionId);
    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "voice.session.ended",
      resourceType: "voice_session",
      resourceId: sessionId,
      result: "succeeded",
    });

    return ok({ ended: true });
  } catch (error) {
    return fail(error, { route: "sessions:end" });
  }
}
