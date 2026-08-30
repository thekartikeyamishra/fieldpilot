import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The Context Graph, relational-first.
 * Every tenant-owned row carries organization_id. Queries scope by it — always.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // admin | supervisor | technician
    role: text("role").notNull().default("technician"),
    status: text("status").notNull().default("active"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_org_idx").on(t.organizationId)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sites_org_code_unique").on(t.organizationId, t.code)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    assetCode: text("asset_code").notNull(),
    assetType: text("asset_type").notNull(),
    status: text("status").notNull().default("operational"),
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assets_org_code_unique").on(t.organizationId, t.assetCode),
    index("assets_org_site_idx").on(t.organizationId, t.siteId),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    severity: text("severity").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("incidents_org_asset_idx").on(t.organizationId, t.assetId, t.createdAt)],
);

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    metric: text("metric").notNull(),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    source: text("source").notNull().default("voice"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("measurements_org_asset_idx").on(t.organizationId, t.assetId, t.recordedAt)],
);

export const procedures = pgTable(
  "procedures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    assetType: text("asset_type").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull().default(1),
    content: text("content").notNull(),
    keywords: text("keywords").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("procedures_org_ref_unique").on(t.organizationId, t.reference),
    index("procedures_org_type_idx").on(t.organizationId, t.assetType),
  ],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    sourceSessionId: uuid("source_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("work_orders_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);

export const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    provider: text("provider").notNull().default("assemblyai"),
    modelCalls: integer("model_calls").notNull().default(0),
    toolCalls: integer("tool_calls").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms").notNull().default(0),
    failureReason: text("failure_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("voice_sessions_org_idx").on(t.organizationId, t.startedAt)],
);

export const conversationEvents = pgTable(
  "conversation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sessionId: uuid("session_id").notNull().references(() => voiceSessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    speaker: text("speaker").notNull(),
    eventType: text("event_type").notNull(),
    content: text("content").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversation_events_seq_unique").on(t.sessionId, t.sequence)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sessionId: uuid("session_id").references(() => voiceSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull().default({}),
    risk: text("risk").notNull().default("low"),
    // proposed | approved | rejected | denied
    authorizationStatus: text("authorization_status").notNull().default("proposed"),
    // pending | succeeded | failed | skipped
    executionStatus: text("execution_status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tool_calls_idempotency_unique").on(t.idempotencyKey),
    index("tool_calls_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    result: text("result").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_org_idx").on(t.organizationId, t.createdAt)],
);

export const outcomes = pgTable(
  "outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sessionId: uuid("session_id").references(() => voiceSessions.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
    problemSummary: text("problem_summary").notNull(),
    recommendation: text("recommendation").notNull().default(""),
    action: text("action").notNull(),
    evidence: jsonb("evidence").$type<unknown[]>().notNull().default([]),
    durationMs: integer("duration_ms").notNull().default(0),
    minutesReturned: integer("minutes_returned").notNull().default(0),
    aiCostUsd: numeric("ai_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outcomes_org_idx").on(t.organizationId, t.createdAt)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    sessionId: uuid("session_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    taskClass: text("task_class").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    success: boolean("success").notNull().default(true),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    cacheHit: boolean("cache_hit").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_org_idx").on(t.organizationId, t.createdAt),
    index("ai_usage_user_idx").on(t.userId, t.createdAt),
    index("ai_usage_session_idx").on(t.sessionId),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Procedure = typeof procedures.$inferSelect;
export type WorkOrder = typeof workOrders.$inferSelect;
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type Outcome = typeof outcomes.$inferSelect;
export type UserRow = typeof users.$inferSelect;
