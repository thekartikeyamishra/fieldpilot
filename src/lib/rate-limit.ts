import { env } from "./env";
import { AppError } from "./errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter, in-process. Sufficient for a single deployment;
 * swap the Map for Redis behind this same function to scale horizontally.
 */
export function rateLimit(
  key: string,
  limit = env.RATE_LIMIT_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): { remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    buckets.set(key, bucket);
    if (buckets.size > 10_000) sweep(now);
    return { remaining: limit - 1, resetAt: bucket.resetAt };
  }

  if (existing.count >= limit) throw new AppError("RATE_LIMITED", `rate limit hit for ${key}`);
  existing.count += 1;
  return { remaining: limit - existing.count, resetAt: existing.resetAt };
}

function sweep(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export const _resetRateLimits = () => buckets.clear();
