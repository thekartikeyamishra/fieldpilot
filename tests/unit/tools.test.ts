import { describe, expect, it } from "vitest";
import { isToolAllowed, toolSchemas, TOOLS, PROPOSABLE_TOOLS } from "@/server/tools/registry";

describe("tool allowlist", () => {
  it("rejects anything not explicitly registered", () => {
    for (const name of ["execute_sql", "run_shell", "fetch_url", "eval", "__proto__", "delete_org"]) {
      expect(isToolAllowed(name)).toBe(false);
    }
  });

  it("rejects injected arguments instead of passing them through", () => {
    const result = toolSchemas.create_work_order.safeParse({
      title: "x'; DROP TABLE work_orders;--",
      priority: "catastrophic",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a non-uuid asset id", () => {
    expect(toolSchemas.get_asset.safeParse({ assetId: "../../etc/passwd" }).success).toBe(false);
  });

  it("bounds numeric measurements", () => {
    expect(toolSchemas.record_measurement.safeParse({ metric: "pressure", value: 1e12, unit: "bar" }).success).toBe(false);
    expect(toolSchemas.record_measurement.safeParse({ metric: "pressure", value: 8.7, unit: "bar" }).success).toBe(true);
  });

  it("caps free text so a transcript cannot become a cost attack", () => {
    const long = "a".repeat(5000);
    expect(toolSchemas.create_work_order.safeParse({ title: long, priority: "high" }).success).toBe(false);
  });

  it("keeps every proposable tool reversible", () => {
    for (const name of PROPOSABLE_TOOLS) expect(TOOLS[name].reversible).toBe(true);
  });
});
