import { describe, expect, it } from "vitest";
import { agentTurnSchema } from "@/ai/schemas";
import { extractJson } from "@/ai/router";

describe("model output validation", () => {
  it("accepts a well-formed turn", () => {
    const r = agentTurnSchema.safeParse({
      spoken: "Pump 3 has two prior vibration incidents.",
      understanding: { problem: "vibration", missing: [] },
      recommendation: { text: "Inspect the rear bearing.", confidence: "high" },
      evidenceRefs: ["E1", "E2"],
      question: null,
      proposal: { tool: "create_work_order", summary: "urgent WO", args: { title: "Bearing inspection", priority: "urgent" } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a tool that is not on the allowlist", () => {
    const r = agentTurnSchema.safeParse({
      spoken: "ok",
      understanding: { problem: null, missing: [] },
      proposal: { tool: "delete_everything", summary: "x", args: {} },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an over-long spoken response", () => {
    const r = agentTurnSchema.safeParse({
      spoken: "x".repeat(900),
      understanding: { problem: null, missing: [] },
    });
    expect(r.success).toBe(false);
  });

  it("recovers JSON wrapped in fences or prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(extractJson("not json at all")).toBeNull();
  });
});
