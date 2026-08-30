import { z } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { runTurn } from "@/server/workflow/orchestrator";

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
    rateLimit(`turn:${session.userId}`, env.RATE_LIMIT_REQUESTS, env.RATE_LIMIT_WINDOW_SECONDS);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "bad turn payload");

    const result = await runTurn({
      session,
      voiceSessionId: parsed.data.sessionId,
      transcript: parsed.data.transcript,
    });

    return ok(result);
  } catch (error) {
    return fail(error, { route: "turn" });
  }
}
