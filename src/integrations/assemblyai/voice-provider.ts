import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";

/**
 * The only file in the codebase that knows AssemblyAI exists.
 * Everything above it talks to VoiceProvider, so replacing the vendor is a
 * new adapter, not a rewrite of the workflow.
 */
export interface VoiceProvider {
  readonly name: string;
  /** Mints a short-lived, single-use credential for the browser. The API key never leaves the server. */
  mintClientToken(maxSessionSeconds: number): Promise<{ token: string; expiresInSeconds: number; websocketUrl: string }>;
  isConfigured(): boolean;
}

class AssemblyAIVoiceProvider implements VoiceProvider {
  readonly name = "assemblyai";

  isConfigured() {
    return Boolean(env.ASSEMBLYAI_API_KEY);
  }

  async mintClientToken(maxSessionSeconds: number) {
    if (!this.isConfigured()) throw new AppError("PROVIDER_NOT_CONFIGURED", "ASSEMBLYAI_API_KEY is not set");

    const ttl = Math.min(Math.max(env.ASSEMBLYAI_TOKEN_TTL_SECONDS, 1), 600);
    const sessionCap = Math.min(Math.max(maxSessionSeconds, 60), 10800);

    const url = new URL(`https://${env.ASSEMBLYAI_STREAMING_HOST}/v3/token`);
    url.searchParams.set("expires_in_seconds", String(ttl));
    url.searchParams.set("max_session_duration_seconds", String(sessionCap));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: env.ASSEMBLYAI_API_KEY },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.error("assemblyai_token_failed", { status: res.status, body: body.slice(0, 200) });
        throw new AppError("PROVIDER_UNAVAILABLE", `token mint failed (${res.status})`);
      }

      const data = (await res.json()) as { token?: string; expires_in_seconds?: number };
      if (!data.token) throw new AppError("PROVIDER_UNAVAILABLE", "token missing from provider response");

      return {
        token: data.token,
        expiresInSeconds: data.expires_in_seconds ?? ttl,
        websocketUrl: this.websocketUrl(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("PROVIDER_UNAVAILABLE", String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Query params only; the token is appended in the browser so it never lands in a log. */
  private websocketUrl() {
    const params = new URLSearchParams({
      sample_rate: "16000",
      encoding: "pcm_s16le",
      speech_model: env.ASSEMBLYAI_SPEECH_MODEL,
      format_turns: "true",
    });
    return `wss://${env.ASSEMBLYAI_STREAMING_HOST}/v3/ws?${params.toString()}`;
  }
}

export const voiceProvider: VoiceProvider = new AssemblyAIVoiceProvider();
