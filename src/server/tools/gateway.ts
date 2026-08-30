import "server-only";
import { and, eq, sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { toolCalls, voiceSessions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { idempotencyKey } from "@/lib/ids";
import { log } from "@/lib/logger";
import { recordAudit } from "../audit/audit";
import { assertAllowed, MAX_AI_TRUST_LEVEL } from "../policy/policy";
import type { Session } from "../auth/session";
import { executors, type ToolExecutionContext, type ToolResult } from "./impl";
import { isToolAllowed, TOOLS, toolSchemas, type ToolName } from "./registry";

/**
 * The single doorway between intent and effect:
 *   allowlist -> schema -> authn -> authz -> policy -> risk -> idempotency ->
 *   execute -> audit.
 * Nothing bypasses it. The model calls this; so does the UI.
 */

export type ProposeInput = {
  session: Session;
  voiceSessionId: string;
  toolName: string;
  args: unknown;
  assetId: string | null;
  proposedBy: "ai" | "user";
};

export type ProposedCall = {
  id: string;
  toolName: ToolName;
  args: Record<string, unknown>;
  risk: string;
  description: string;
  requiresConfirmation: boolean;
};

export async function proposeToolCall(input: ProposeInput): Promise<ProposedCall> {
  if (!env.FEATURE_TOOL_EXECUTION) throw new AppError("FEATURE_DISABLED", "tool execution flag off");
  if (!isToolAllowed(input.toolName)) {
    await recordAudit({
      organizationId: input.session.organizationId,
      actorType: "ai_agent",
      actorId: input.session.userId,
      action: "tool.proposal.denied",
      resourceType: "tool",
      resourceId: input.toolName,
      result: "denied",
      metadata: { reason: "not on allowlist" },
    });
    throw new AppError("TOOL_NOT_ALLOWED", `tool ${input.toolName} is not on the allowlist`);
  }

  const definition = TOOLS[input.toolName];
  const parsed = toolSchemas[input.toolName].safeParse(input.args);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", `invalid arguments for ${input.toolName}`, parsed.error.flatten());
  }

  const decision = assertAllowed({
    role: input.session.role,
    actorOrganizationId: input.session.organizationId,
    resourceOrganizationId: input.session.organizationId,
    permission: definition.permission,
    risk: definition.risk,
    aiTrustLevel: MAX_AI_TRUST_LEVEL,
    initiatedByAi: input.proposedBy === "ai",
  });

  const args = parsed.data as Record<string, unknown>;
  const key = idempotencyKey(
    input.session.organizationId,
    input.voiceSessionId,
    input.toolName,
    JSON.stringify(args),
    input.assetId ?? "-",
  );

  // A repeated proposal is the same proposal. Re-offering it is not a new draft.
  const [existing] = await db.select().from(toolCalls).where(eq(toolCalls.idempotencyKey, key)).limit(1);
  if (existing) {
    return {
      id: existing.id,
      toolName: existing.toolName as ToolName,
      args: existing.arguments,
      risk: existing.risk,
      description: definition.describe(args),
      requiresConfirmation: decision.requiresConfirmation,
    };
  }

  const [row] = await db
    .insert(toolCalls)
    .values({
      organizationId: input.session.organizationId,
      sessionId: input.voiceSessionId,
      userId: input.session.userId,
      toolName: input.toolName,
      arguments: { ...args, __assetId: input.assetId },
      risk: definition.risk,
      authorizationStatus: "proposed",
      executionStatus: "pending",
      idempotencyKey: key,
    })
    .returning();

  await recordAudit({
    organizationId: input.session.organizationId,
    actorType: input.proposedBy === "ai" ? "ai_agent" : "user",
    actorId: input.session.userId,
    action: "tool.proposed",
    resourceType: "tool_call",
    resourceId: row.id,
    result: "allowed",
    metadata: { tool: input.toolName, risk: definition.risk },
  });

  return {
    id: row.id,
    toolName: input.toolName,
    args,
    risk: definition.risk,
    description: definition.describe(args),
    requiresConfirmation: decision.requiresConfirmation,
  };
}

export type ExecutionOutcome = {
  toolCallId: string;
  toolName: ToolName;
  summary: string;
  data: Record<string, unknown>;
  duplicate: boolean;
};

/**
 * Human approval turns a draft into an action. Called only after the user taps
 * Approve. Executing twice returns the first result rather than a second record.
 */
export async function executeApproved(params: {
  session: Session;
  toolCallId: string;
  decision: "approve" | "reject";
}): Promise<ExecutionOutcome | { rejected: true }> {
  const [call] = await db
    .select()
    .from(toolCalls)
    .where(and(eq(toolCalls.id, params.toolCallId), eq(toolCalls.organizationId, params.session.organizationId)))
    .limit(1);

  if (!call) throw new AppError("NOT_FOUND", "tool call not found in this organisation");
  if (call.userId !== params.session.userId && params.session.role === "technician") {
    throw new AppError("FORBIDDEN", "another technician's draft");
  }

  if (params.decision === "reject") {
    await db
      .update(toolCalls)
      .set({ authorizationStatus: "rejected", executionStatus: "skipped", completedAt: new Date() })
      .where(eq(toolCalls.id, call.id));
    await recordAudit({
      organizationId: call.organizationId,
      actorType: "user",
      actorId: params.session.userId,
      action: "tool.rejected",
      resourceType: "tool_call",
      resourceId: call.id,
      result: "denied",
      metadata: { tool: call.toolName },
    });
    return { rejected: true };
  }

  // Idempotency: an approved-and-executed call replays its stored result.
  if (call.executionStatus === "succeeded" && call.result) {
    return {
      toolCallId: call.id,
      toolName: call.toolName as ToolName,
      summary: String(call.result.summary ?? "already completed"),
      data: call.result as Record<string, unknown>,
      duplicate: true,
    };
  }

  if (call.sessionId) {
    const [vs] = await db.select().from(voiceSessions).where(eq(voiceSessions.id, call.sessionId)).limit(1);
    if (vs && vs.toolCalls >= env.VOICE_MAX_TOOL_CALLS_PER_SESSION) {
      throw new AppError("SESSION_LIMIT_REACHED", "tool call ceiling reached for session");
    }
  }

  const toolName = call.toolName as ToolName;
  const definition = TOOLS[toolName];

  // Re-run policy at execution time. Permissions may have changed since the draft.
  assertAllowed({
    role: params.session.role,
    actorOrganizationId: params.session.organizationId,
    resourceOrganizationId: call.organizationId,
    permission: definition.permission,
    risk: definition.risk,
    aiTrustLevel: MAX_AI_TRUST_LEVEL,
    initiatedByAi: false,
  });

  const { __assetId: boundAssetId, ...args } = call.arguments as Record<string, unknown> & { __assetId?: string };

  const ctx: ToolExecutionContext = {
    organizationId: call.organizationId,
    userId: params.session.userId,
    sessionId: call.sessionId,
    assetId: (boundAssetId as string) ?? null,
  };

  try {
    const result: ToolResult = await executors[toolName](args, ctx);

    await db
      .update(toolCalls)
      .set({
        authorizationStatus: "approved",
        executionStatus: "succeeded",
        result: { summary: result.summary, ...result.data },
        completedAt: new Date(),
      })
      .where(eq(toolCalls.id, call.id));

    if (call.sessionId) {
      await db
        .update(voiceSessions)
        .set({ toolCalls: raw`${voiceSessions.toolCalls} + 1` })
        .where(eq(voiceSessions.id, call.sessionId));
    }

    await recordAudit({
      organizationId: call.organizationId,
      actorType: "user",
      actorId: params.session.userId,
      action: "tool.executed",
      resourceType: result.resourceType,
      resourceId: result.resourceId,
      result: "succeeded",
      metadata: { tool: toolName, approvedByHuman: true },
    });

    return {
      toolCallId: call.id,
      toolName,
      summary: result.summary,
      data: result.data,
      duplicate: false,
    };
  } catch (error) {
    await db
      .update(toolCalls)
      .set({
        authorizationStatus: "approved",
        executionStatus: "failed",
        errorCode: error instanceof AppError ? error.code : "INTERNAL",
        completedAt: new Date(),
      })
      .where(eq(toolCalls.id, call.id));

    await recordAudit({
      organizationId: call.organizationId,
      actorType: "system",
      actorId: params.session.userId,
      action: "tool.failed",
      resourceType: "tool_call",
      resourceId: call.id,
      result: "failed",
      metadata: { tool: toolName },
    });

    log.error("tool_execution_failed", { tool: toolName, error: String(error) });
    throw error instanceof AppError ? error : new AppError("TOOL_FAILED", String(error));
  }
}
