import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { sarvamSttCost, sarvamTtsCost } from "@/server/cost/pricing";
import type { Language } from "@/server/i18n/languages";

/**
 * Sarvam adapter for Indian languages.
 *
 * Two deliberate choices worth explaining:
 *
 * 1. Utterance REST, not streaming WebSocket. A technician speaks in short
 *    bursts ("पंप 3 में vibration आ रहा है"), not monologues. Posting a 5–15
 *    second clip through our server keeps the subscription key server-side —
 *    the browser never holds a credential — and avoids paying for an open
 *    socket during the silence between turns, which is most of a field session.
 *
 * 2. TTS is opt-in and cached. At ₹30 per 10k characters, speech output is the
 *    most expensive part of an Indian-language turn — more than the model call.
 *    English uses the browser's free voice; Indic pays only when it must.
 */

const BASE = "https://api.sarvam.ai";

export const sarvamConfigured = () => Boolean(env.SARVAM_API_KEY);

function headers() {
  if (!sarvamConfigured()) throw new AppError("PROVIDER_NOT_CONFIGURED", "SARVAM_API_KEY is not set");
  return { "api-subscription-key": env.SARVAM_API_KEY };
}

export type TranscriptionResult = {
  transcript: string;
  detectedLanguage: string | null;
  costUsd: number;
  durationMs: number;
};

/** Speech to text for one utterance. */
export async function transcribe(input: {
  audio: Blob | Buffer;
  language: Language;
  durationMs: number;
}): Promise<TranscriptionResult> {
  const form = new FormData();
  const blob = input.audio instanceof Blob ? input.audio : new Blob([new Uint8Array(input.audio)]);
  form.append("file", blob, "utterance.wav");
  form.append("model", env.SARVAM_STT_MODEL);
  // "unknown" lets Sarvam auto-detect, which matters for code-mixed speech.
  form.append("language_code", input.language.sarvamCode);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${BASE}/speech-to-text`, {
      method: "POST",
      headers: headers(),
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("sarvam_stt_failed", { status: res.status, body: body.slice(0, 200) });
      throw new AppError("PROVIDER_UNAVAILABLE", `Sarvam STT failed (${res.status})`);
    }

    const data = (await res.json()) as { transcript?: string; language_code?: string };
    return {
      transcript: (data.transcript ?? "").trim(),
      detectedLanguage: data.language_code ?? null,
      costUsd: sarvamSttCost(input.durationMs),
      durationMs: input.durationMs,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === "AbortError") throw new AppError("PROVIDER_UNAVAILABLE", "Sarvam STT timeout");
    throw new AppError("PROVIDER_UNAVAILABLE", String(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A small cache of synthesised confirmations. Field dialogue is repetitive —
 * "Work order created", "Which asset?", "I need the pressure" recur constantly.
 * Caching them turns the most expensive line item into a near-zero one.
 */
const ttsCache = new Map<string, { audioBase64: string; expiresAt: number }>();
const TTS_CACHE_MAX = 200;

/** Hard ceiling on spoken output. Every character past this is money for nothing. */
export const MAX_SPOKEN_CHARS = 180;

export type SynthesisResult = {
  audioBase64: string;
  costUsd: number;
  cacheHit: boolean;
  charsSpoken: number;
};

export async function synthesise(input: { text: string; language: Language }): Promise<SynthesisResult> {
  // Truncate at a sentence boundary rather than mid-word.
  let text = input.text.trim();
  if (text.length > MAX_SPOKEN_CHARS) {
    const cut = text.slice(0, MAX_SPOKEN_CHARS);
    const lastStop = Math.max(cut.lastIndexOf("।"), cut.lastIndexOf("."), cut.lastIndexOf("?"));
    text = lastStop > 60 ? cut.slice(0, lastStop + 1) : cut;
  }

  const key = `${input.language.sarvamCode}:${text}`;
  const hit = ttsCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { audioBase64: hit.audioBase64, costUsd: 0, cacheHit: true, charsSpoken: text.length };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${BASE}/text-to-speech`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target_language_code: input.language.sarvamCode,
        model: env.SARVAM_TTS_MODEL,
        speaker: env.SARVAM_TTS_SPEAKER,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("sarvam_tts_failed", { status: res.status, body: body.slice(0, 200) });
      throw new AppError("PROVIDER_UNAVAILABLE", `Sarvam TTS failed (${res.status})`);
    }

    const data = (await res.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0] ?? "";
    if (!audioBase64) throw new AppError("PROVIDER_UNAVAILABLE", "Sarvam TTS returned no audio");

    if (ttsCache.size >= TTS_CACHE_MAX) {
      const oldest = ttsCache.keys().next().value;
      if (oldest) ttsCache.delete(oldest);
    }
    ttsCache.set(key, { audioBase64, expiresAt: Date.now() + 24 * 3600_000 });

    return { audioBase64, costUsd: sarvamTtsCost(text.length), cacheHit: false, charsSpoken: text.length };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("PROVIDER_UNAVAILABLE", String(error));
  } finally {
    clearTimeout(timer);
  }
}

export const _clearTtsCache = () => ttsCache.clear();
