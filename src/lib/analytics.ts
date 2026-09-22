import "server-only";
import { db } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { hashId } from "./ids";
import { log } from "./logger";

/**
 * Funnel instrumentation. Measures the customer-facing outcome, never AI
 * activity: no page views, no button counts, no downloads.
 *
 * Identifiers are salted-hashed before they are stored, so this table can be
 * queried freely without touching personal data.
 */
export type AnalyticsEvent =
  | "signup_completed"
  | "voice_session_started"
  | "first_turn_submitted"
  | "asset_identified"
  | "recommendation_shown"
  | "action_proposed"
  | "action_approved"
  | "action_rejected"
  | "outcome_recorded"
  | "aha_reached"
  | "turn_degraded"
  | "budget_ceiling_hit"
  | "data_exported"
  | "data_imported"
  | "checkout_started"
  | "credits_purchased";

export type TrackInput = {
  organizationId: string;
  userId: string;
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
};

/**
 * Awaitable, but never throwing.
 *
 * "Fire and forget" is a lie on serverless: the runtime can freeze the instance
 * the moment the response is returned, dropping any promise still in flight. So
 * callers await this, and it swallows its own errors instead — instrumentation
 * must never be able to fail a user's action.
 */
export async function track(input: TrackInput): Promise<void> {
  await db
    .insert(analyticsEvents)
    .values({
      orgHash: hashId(input.organizationId),
      userHash: hashId(input.userId),
      event: input.event,
      properties: sanitise(input.properties ?? {}),
    })
    .catch((error) => log.warn("analytics_write_failed", { event: input.event, error: String(error) }));
}

/**
 * A property allowlist by shape: numbers, booleans and short enum-ish strings
 * only. Free text is where PII leaks into telemetry, so it never gets in.
 */
function sanitise(properties: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "string" && value.length <= 40 && !value.includes(" ")) clean[key] = value;
  }
  return clean;
}

/** The aha moment: a technician's first real work action, timed from session start. */
export async function trackAha(input: { organizationId: string; userId: string; secondsToValue: number; toolName: string }) {
  await track({
    organizationId: input.organizationId,
    userId: input.userId,
    event: "aha_reached",
    properties: {
      secondsToValue: Math.round(input.secondsToValue),
      withinTarget: input.secondsToValue <= 120,
      tool: input.toolName,
    },
  });
}
