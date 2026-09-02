import { sql as client } from "@/db/client";
import { env } from "./env";
import { AppError } from "./errors";
import { log } from "./logger";

/**
 * Fixed-window limiter backed by Postgres.
 *
 * It lives in the database because serverless gives every request a possibly
 * fresh instance: an in-process counter is per-instance, which under real load
 * is indistinguishable from no limit at all. Cost control and abuse defence
 * both depend on this being shared state.
 *
 * The whole check is a single atomic upsert, so concurrent requests cannot
 * both read a stale count and both pass.
 */
export type RateLimitResult = { remaining: number; resetAt: Date };

export async function rateLimit(
  key: string,
  limit = env.RATE_LIMIT_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  // Bind an explicit ISO string with a cast rather than a Date object: driver
  // date serialisation is a needless dependency for a counter this important.
  const resetIso = resetAt.toISOString();

  try {
    // The driver directly rather than through the query builder: this is a
    // single atomic upsert and the builder's execute() wrapper adds nothing
    // except a failure mode.
    const rows = await client<Array<{ count: number; reset_at: Date }>>`
      insert into rate_limits (key, count, reset_at)
      values (${key}, 1, ${resetIso}::timestamptz)
      on conflict (key) do update set
        count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
        reset_at = case when rate_limits.reset_at <= now() then ${resetIso}::timestamptz else rate_limits.reset_at end
      returning count, reset_at
    `;

    const row = rows[0];
    const count = Number(row?.count ?? 1);
    const windowEnd = row?.reset_at ? new Date(row.reset_at) : resetAt;

    if (count > limit) throw new AppError("RATE_LIMITED", `rate limit hit for ${key}`);
    return { remaining: Math.max(0, limit - count), resetAt: windowEnd };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // A limiter outage must not take the product down with it. We log loudly
    // and allow the request: availability beats a perfect count here, and the
    // cost governor is a second, independent ceiling underneath.
    log.error("rate_limit_unavailable", { key, error: String(error) });
    return { remaining: limit, resetAt };
  }
}

/** Housekeeping. Safe to call from a cron; expired rows are otherwise harmless. */
export async function pruneRateLimits(): Promise<number> {
  const rows = await client`delete from rate_limits where reset_at < now() - interval '1 hour' returning key`;
  return rows.length;
}

/**
 * Is the limiter actually working?
 *
 * It fails open by design — an outage should not take the product down — but a
 * silently broken limiter looks exactly like a working one from the outside,
 * which is how a cost-control system quietly stops existing. So /api/health
 * proves it round-trips on every check.
 */
export async function rateLimiterHealthy(): Promise<{ ok: boolean; detail: string }> {
  try {
    // Must prove the counter PERSISTED, not merely that the call returned.
    // The first version of this check asserted `remaining > 0`, which is also
    // what a completely broken limiter returns when it fails open — so it
    // reported green while nothing was being counted at all.
    const probe = `__health:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await rateLimit(probe, 1_000_000, 30);
    const rows = await client<Array<{ count: number }>>`select count from rate_limits where key = ${probe}`;
    const persisted = Number(rows[0]?.count ?? 0) === 1;
    await client`delete from rate_limits where key = ${probe}`;
    return persisted
      ? { ok: true, detail: "durable counter round-trips" }
      : { ok: false, detail: "limiter is failing open — counters are NOT being recorded" };
  } catch (error) {
    return { ok: false, detail: `limiter not usable: ${String(error).slice(0, 100)}` };
  }
}
