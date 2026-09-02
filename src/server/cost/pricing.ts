/**
 * Per-1M-token prices in USD, used for pre-flight estimates and post-call accounting.
 * Provider prices change; this table is configuration, not truth. Update it, and the
 * credit abstraction in front of it means customer pricing does not have to move.
 */
export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

const DEFAULT_PRICE: ModelPrice = { inputPerMTok: 1.0, outputPerMTok: 5.0 };

const PRICES: Record<string, ModelPrice> = {
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-sonnet-4.6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-sonnet-4-5-20250929": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  // Sarvam, converted from INR 29.28 / 73.2 per 1M tokens.
  "sarvam-105b": { inputPerMTok: 0.333, outputPerMTok: 0.832 },
  "sarvam-105b-conversations": { inputPerMTok: 0.333, outputPerMTok: 0.832 },
  "gemma4": { inputPerMTok: 0.416, outputPerMTok: 1.04 },
};

/** Voice is billed on connection time, not audio volume. */
export const STREAMING_USD_PER_MINUTE = 0.0075;

/**
 * Sarvam publishes in rupees. One conversion constant, deliberately pessimistic,
 * so a weakening rupee makes us look poorer rather than richer.
 * Source: docs.sarvam.ai/api/getting-started/pricing, 2026.
 */
export const USD_PER_INR = 1 / 88;

export const SARVAM_INR = {
  sttPerHour: 30,
  sttDiarizedPerHour: 45,
  ttsPer10kChars: 30,
  languageIdPer10kChars: 3.5,
} as const;

/** Sarvam STT is cheaper per minute than streaming English ASR. */
export const SARVAM_STT_USD_PER_MINUTE = (SARVAM_INR.sttPerHour / 60) * USD_PER_INR;

/**
 * Text-to-speech is the single most expensive part of an Indian-language turn —
 * more than the model call. Every optimisation below exists because of this line.
 */
export const SARVAM_TTS_USD_PER_CHAR = (SARVAM_INR.ttsPer10kChars / 10_000) * USD_PER_INR;

export const sarvamTtsCost = (chars: number) => chars * SARVAM_TTS_USD_PER_CHAR;
export const sarvamSttCost = (ms: number) => (ms / 60_000) * SARVAM_STT_USD_PER_MINUTE;

export function priceFor(model: string): ModelPrice {
  return PRICES[model] ?? DEFAULT_PRICE;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}

/** ~4 characters per token is close enough for a budget pre-check. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const voiceCost = (durationMs: number): number =>
  (durationMs / 60_000) * STREAMING_USD_PER_MINUTE;
