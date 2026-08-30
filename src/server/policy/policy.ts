import { AppError } from "@/lib/errors";
import { can, type Permission, type Role } from "./roles";

/**
 * The policy engine answers "may this action happen?" - never "does the AI want to?".
 * Pure functions: no I/O, fully unit-testable, called on every consequential path.
 */

export type Risk = "read" | "low" | "medium" | "high";

export type PolicyInput = {
  role: Role;
  actorOrganizationId: string;
  /** Organisation that owns the record being touched. */
  resourceOrganizationId: string;
  permission: Permission;
  risk: Risk;
  /** AI trust level granted: 0 observe, 1 recommend, 2 draft, 3 execute low-risk. */
  aiTrustLevel: number;
  initiatedByAi: boolean;
};

export type PolicyDecision =
  | { allowed: true; requiresConfirmation: boolean; reason: string }
  | { allowed: false; requiresConfirmation: false; reason: string; code: "FORBIDDEN" | "TOOL_NOT_ALLOWED" };

export const MAX_AI_TRUST_LEVEL = 3;

export function evaluate(input: PolicyInput): PolicyDecision {
  // 1. Tenant isolation. Checked before anything else, every time.
  if (input.actorOrganizationId !== input.resourceOrganizationId) {
    return { allowed: false, requiresConfirmation: false, reason: "cross-tenant access", code: "FORBIDDEN" };
  }

  // 2. Role permission.
  if (!can(input.role, input.permission)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `role ${input.role} lacks ${input.permission}`,
      code: "FORBIDDEN",
    };
  }

  // 3. AI trust ladder. The model never exceeds the level the platform granted it.
  if (input.initiatedByAi) {
    if (input.risk === "high") {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "high-risk action is not AI-executable",
        code: "TOOL_NOT_ALLOWED",
      };
    }
    if (input.risk !== "read" && input.aiTrustLevel < 2) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "AI trust level below draft",
        code: "TOOL_NOT_ALLOWED",
      };
    }
  }

  // 4. Anything that writes and was proposed by the AI needs a human tap.
  const requiresConfirmation = input.initiatedByAi && input.risk !== "read";
  return { allowed: true, requiresConfirmation, reason: "ok" };
}

export function assertAllowed(input: PolicyInput): PolicyDecision {
  const decision = evaluate(input);
  if (!decision.allowed) throw new AppError(decision.code, decision.reason);
  return decision;
}
