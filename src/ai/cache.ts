import { createHash } from "node:crypto";

/**
 * Layer 3 of the cost cascade: an exact-match response cache.
 * "Say that again" and repeated turns cost nothing. In-process and bounded;
 * swap for Redis behind the same two functions when you run more than one node.
 */
type Entry<T> = { value: T; expiresAt: number };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry<unknown>>();

export const cacheKey = (...parts: (string | number)[]) =>
  createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlSeconds = 600): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export const cacheClear = () => store.clear();
