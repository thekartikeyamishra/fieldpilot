import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimits, rateLimit } from "@/lib/rate-limit";
import { idempotencyKey } from "@/lib/ids";

describe("rate limiting", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to the limit and then refuses", () => {
    for (let i = 0; i < 3; i++) expect(() => rateLimit("k", 3, 60)).not.toThrow();
    expect(() => rateLimit("k", 3, 60)).toThrow();
  });

  it("keeps buckets separate per key", () => {
    rateLimit("user-a", 1, 60);
    expect(() => rateLimit("user-b", 1, 60)).not.toThrow();
  });
});

describe("idempotency", () => {
  it("produces the same key for the same logical intent", () => {
    const a = idempotencyKey("org", "session", "create_work_order", '{"title":"x"}');
    const b = idempotencyKey("org", "session", "create_work_order", '{"title":"x"}');
    expect(a).toBe(b);
  });

  it("produces a different key for a different intent", () => {
    const a = idempotencyKey("org", "session", "create_work_order", '{"title":"x"}');
    const b = idempotencyKey("org", "session", "create_work_order", '{"title":"y"}');
    expect(a).not.toBe(b);
  });
});
