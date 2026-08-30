import "server-only";
import { env, aiApiKey } from "@/lib/env";
import { log } from "@/lib/logger";
import { complete, ProviderError, type ChatMessage } from "./providers/openai-compatible";

/**
 * The model router. Business logic asks for a task class and a tier; it never
 * names a vendor. Swapping providers is an environment change, not a rewrite.
 */
export type Tier = "fast" | "smart";

export type RouteRequest = {
  taskClass: string;
  tier: Tier;
  messages: ChatMessage[];
  maxTokens?: number;
  json?: boolean;
};

export type RouteResult = {
  text: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  fallbackUsed: boolean;
};

const modelFor = (tier: Tier) => (tier === "smart" ? env.AI_MODEL_SMART : env.AI_MODEL_FAST);

export function isModelConfigured(): boolean {
  return Boolean(aiApiKey() && env.AI_BASE_URL);
}

/**
 * One retry on transient failures, then the configured fallback provider,
 * then a hard error the caller degrades from. No unbounded retry loops.
 */
export async function route(req: RouteRequest): Promise<RouteResult> {
  const started = Date.now();
  const primaryModel = modelFor(req.tier);

  if (!isModelConfigured()) throw new ProviderError("no model provider configured", undefined, false);

  try {
    const result = await withRetry(() =>
      complete({
        baseUrl: env.AI_BASE_URL,
        apiKey: aiApiKey(),
        model: primaryModel,
        messages: req.messages,
        maxTokens: req.maxTokens ?? 500,
        json: req.json,
      }),
    );
    return {
      text: result.text,
      model: result.model,
      provider: "assemblyai-llm-gateway",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: Date.now() - started,
      fallbackUsed: false,
    };
  } catch (error) {
    log.warn("model_primary_failed", { taskClass: req.taskClass, model: primaryModel, error: String(error) });

    if (env.AI_FALLBACK_BASE_URL && env.AI_FALLBACK_API_KEY && env.AI_FALLBACK_MODEL) {
      const result = await complete({
        baseUrl: env.AI_FALLBACK_BASE_URL,
        apiKey: env.AI_FALLBACK_API_KEY,
        model: env.AI_FALLBACK_MODEL,
        messages: req.messages,
        maxTokens: req.maxTokens ?? 500,
        json: req.json,
      });
      return {
        text: result.text,
        model: result.model,
        provider: "fallback",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: Date.now() - started,
        fallbackUsed: true,
      };
    }
    throw error;
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (i < attempts - 1) {
        const backoff = 250 * 2 ** i + Math.random() * 100; // jitter
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}

/** Tolerant JSON extraction: models occasionally wrap JSON in prose or fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
