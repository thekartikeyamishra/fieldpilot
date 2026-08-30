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
};

/** Voice is billed on connection time, not audio volume. */
export const STREAMING_USD_PER_MINUTE = 0.0075;

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
