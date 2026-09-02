import { describe, expect, it } from "vitest";
import { idempotencyKey } from "@/lib/ids";

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
