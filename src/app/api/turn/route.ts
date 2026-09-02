import { z } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { runTurn } from "@/server/workflow/orchestrator";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  sessionId: z.string().uuid(),
  transcript: z.string().min(1).max(4000),
});

/** One finalised spoken turn in, one bounded, evidence-backed turn out. */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await rateLimit(`turn:${session.userId}`, env.RATE_LIMIT_REQUESTS, env.RATE_LIMIT_WINDOW_SECONDS);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "bad turn payload");

    const result = await runTurn({
      session,
      voiceSessionId: parsed.data.sessionId,
      transcript: parsed.data.transcript,
    });

    await track({
      organizationId: session.organizationId,
      userId: session.userId,
      event: result.proposal ? "action_proposed" : result.recommendation ? "recommendation_shown" : "first_turn_submitted",
      properties: {
        path: result.meta.path,
        latencyMs: result.meta.latencyMs,
        assetIdentified: Boolean(result.asset),
        evidenceCount: result.evidence.length,
      },
    });
    if (result.meta.degraded) {
      await track({ organizationId: session.organizationId, userId: session.userId, event: "turn_degraded", properties: { path: result.meta.path } });
    }

    return ok(result);
  } catch (error) {
    return fail(error, { route: "turn" });
  }
}
