import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/policy/roles";
import { recordAudit } from "@/server/audit/audit";
import { voiceProvider } from "@/integrations/assemblyai/voice-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a single-use streaming credential. The provider API key stays on the
 * server; the browser only ever holds a token that dies in 60 seconds.
 */
export async function POST() {
  try {
    const session = await requireSession();
    if (!can(session.role, "voice:use")) throw new AppError("FORBIDDEN", "role cannot use voice");
    await rateLimit(`voice-token:${session.userId}`, 20, 60);

    const minted = await voiceProvider.mintClientToken(env.VOICE_SESSION_MAX_SECONDS);

    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "voice.token.minted",
      resourceType: "voice_provider",
      result: "succeeded",
      metadata: { provider: voiceProvider.name },
    });

    return ok({
      token: minted.token,
      websocketUrl: minted.websocketUrl,
      expiresInSeconds: minted.expiresInSeconds,
      maxSessionSeconds: env.VOICE_SESSION_MAX_SECONDS,
    });
  } catch (error) {
    return fail(error, { route: "voice/token" });
  }
}
