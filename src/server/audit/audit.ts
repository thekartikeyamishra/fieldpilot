import "server-only";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { log } from "@/lib/logger";
import { hashId } from "@/lib/ids";

export type AuditInput = {
  organizationId: string;
  actorType: "user" | "ai_agent" | "system";
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  requestId?: string | null;
  result: "allowed" | "denied" | "succeeded" | "failed";
  metadata?: Record<string, unknown>;
};

/**
 * Append-only. Application code never updates or deletes an audit row.
 * Auditing must never break the user's action, so failures are logged, not thrown.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId ?? null,
      result: input.result,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    log.error("audit_write_failed", { action: input.action, error: String(error) });
  }
  log.info("audit", {
    action: input.action,
    result: input.result,
    org: hashId(input.organizationId),
    actor: input.actorId ? hashId(input.actorId) : null,
  });
}
