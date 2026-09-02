import { env } from "@/lib/env";
import { costOf, sarvamSttCost, sarvamTtsCost, STREAMING_USD_PER_MINUTE, USD_PER_INR } from "../cost/pricing";
import type { Language } from "../i18n/languages";

/**
 * What one voice turn actually costs us, broken down by language path.
 *
 * This exists because the two paths have different cost shapes, and pricing them
 * identically would quietly lose money on one of them:
 *
 *   English  — streaming ASR billed per connected minute, cheap model, free
 *              browser speech output.
 *   Indic    — utterance ASR billed per second of audio, a cheaper model, but
 *              PAID speech output that dominates everything else.
 *
 * Every figure derives from published provider rates in cost/pricing.ts.
 */

export type TurnShape = {
  /** Seconds of audio the technician actually spoke. */
  speechSeconds: number;
  inputTokens: number;
  outputTokens: number;
  /** Characters we will speak back. Zero when the reply is text-only. */
  spokenChars: number;
  ttsCacheHit: boolean;
};

export const TYPICAL_TURN: TurnShape = {
  speechSeconds: 12,
  inputTokens: 1800,
  outputTokens: 300,
  spokenChars: 160,
  ttsCacheHit: false,
};

export type TurnCost = {
  speechUsd: number;
  modelUsd: number;
  ttsUsd: number;
  totalUsd: number;
  totalInr: number;
  dominantComponent: "speech" | "model" | "tts";
};

export function turnCost(language: Language, shape: TurnShape = TYPICAL_TURN): TurnCost {
  const isIndic = language.route === "sarvam";

  // English streams for the whole turn; Sarvam bills only the spoken seconds.
  const speechUsd = isIndic
    ? sarvamSttCost(shape.speechSeconds * 1000)
    : ((shape.speechSeconds + 8) / 60) * STREAMING_USD_PER_MINUTE;

  const model = isIndic ? env.SARVAM_LLM_MODEL : env.AI_MODEL_FAST;
  const modelUsd = costOf(model, shape.inputTokens, shape.outputTokens);

  // We pay for speech output only where the browser has no usable voice.
  const needsPaidTts = isIndic && !language.browserTts && env.SARVAM_TTS_ENABLED;
  const ttsUsd = needsPaidTts && !shape.ttsCacheHit ? sarvamTtsCost(shape.spokenChars) : 0;

  const totalUsd = speechUsd + modelUsd + ttsUsd;
  const parts = { speech: speechUsd, model: modelUsd, tts: ttsUsd };
  const dominantComponent = (Object.keys(parts) as Array<keyof typeof parts>).reduce((a, b) =>
    parts[a] >= parts[b] ? a : b,
  );

  return { speechUsd, modelUsd, ttsUsd, totalUsd, totalInr: totalUsd / USD_PER_INR, dominantComponent };
}

/**
 * Credits charged for a turn. An Indic turn with paid speech output genuinely
 * costs more to serve, so it costs more — but only when we actually paid.
 * A cached confirmation, or a text-only reply, charges the standard rate.
 */
export function creditsForLanguageTurn(input: {
  language: Language;
  tier: "fast" | "smart";
  spokeAloud: boolean;
  ttsCacheHit: boolean;
}): number {
  const base = input.tier === "smart" ? env.CREDITS_PER_REASONING_TURN : env.CREDITS_PER_FAST_TURN;
  const paidTts =
    input.language.route === "sarvam" && !input.language.browserTts && input.spokeAloud && !input.ttsCacheHit;
  return base + (paidTts ? 1 : 0);
}

/**
 * The guardrail: does a turn earn more than it costs, on every language path?
 * Called by tests so a pricing change cannot silently go underwater.
 */
export function turnMargin(language: Language, shape: TurnShape = TYPICAL_TURN) {
  const cost = turnCost(language, shape);
  const credits = creditsForLanguageTurn({
    language,
    tier: "fast",
    spokeAloud: shape.spokenChars > 0,
    ttsCacheHit: shape.ttsCacheHit,
  });
  const revenueUsd = credits * env.CREDIT_PRICE_USD;

  return {
    credits,
    revenueUsd,
    costUsd: cost.totalUsd,
    marginUsd: revenueUsd - cost.totalUsd,
    marginPct: revenueUsd > 0 ? ((revenueUsd - cost.totalUsd) / revenueUsd) * 100 : 0,
    healthy: revenueUsd > cost.totalUsd,
    breakdown: cost,
  };
}
