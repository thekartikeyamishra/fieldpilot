import { describe, expect, it } from "vitest";
import { evaluate, MAX_AI_TRUST_LEVEL } from "@/server/policy/policy";
import { can } from "@/server/policy/roles";

const base = {
  role: "technician" as const,
  actorOrganizationId: "org-a",
  resourceOrganizationId: "org-a",
  permission: "work_order:create" as const,
  risk: "medium" as const,
  aiTrustLevel: MAX_AI_TRUST_LEVEL,
  initiatedByAi: true,
};

describe("policy engine", () => {
  it("blocks cross-tenant access before anything else", () => {
    const d = evaluate({ ...base, resourceOrganizationId: "org-b" });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("FORBIDDEN");
  });

  it("blocks cross-tenant access even for an admin", () => {
    const d = evaluate({ ...base, role: "admin", resourceOrganizationId: "org-b" });
    expect(d.allowed).toBe(false);
  });

  it("denies a permission the role does not hold", () => {
    const d = evaluate({ ...base, permission: "org:manage", initiatedByAi: false });
    expect(d.allowed).toBe(false);
  });

  it("requires human confirmation for every AI-initiated write", () => {
    const d = evaluate(base);
    expect(d.allowed).toBe(true);
    expect(d.requiresConfirmation).toBe(true);
  });

  it("does not require confirmation for AI reads", () => {
    const d = evaluate({ ...base, risk: "read", permission: "asset:read" });
    expect(d.allowed).toBe(true);
    expect(d.requiresConfirmation).toBe(false);
  });

  it("never lets the AI perform a high-risk action, at any trust level", () => {
    const d = evaluate({ ...base, risk: "high", aiTrustLevel: 5 });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("TOOL_NOT_ALLOWED");
  });

  it("refuses AI writes below the draft trust level", () => {
    const d = evaluate({ ...base, aiTrustLevel: 1 });
    expect(d.allowed).toBe(false);
  });

  it("keeps technicians out of admin surface", () => {
    expect(can("technician", "org:manage")).toBe(false);
    expect(can("technician", "audit:read")).toBe(false);
    expect(can("technician", "voice:use")).toBe(true);
    expect(can("supervisor", "work_order:close")).toBe(true);
  });
});
