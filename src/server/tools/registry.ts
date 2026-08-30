import { z } from "zod";
import type { Permission } from "../policy/roles";
import type { Risk } from "../policy/policy";

/**
 * The allowlist. If a tool is not in this object it does not exist, whatever
 * the model asks for. There is deliberately no execute_sql, no fetch_url,
 * no run_code — the escape hatches that turn an agent into an incident.
 */

export const toolSchemas = {
  get_asset: z.object({ assetId: z.string().uuid() }),
  get_asset_history: z.object({ assetId: z.string().uuid(), limit: z.number().int().min(1).max(20).default(5) }),
  search_procedure: z.object({ query: z.string().min(2).max(120) }),
  record_measurement: z.object({
    metric: z.string().min(1).max(48),
    value: z.number().finite().min(-1_000_000).max(1_000_000),
    unit: z.string().min(1).max(16),
  }),
  create_incident: z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(1000).default(""),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  }),
  create_work_order: z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(2000).default(""),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  }),
  update_work_order: z.object({
    workOrderId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

export type ToolDefinition = {
  name: ToolName;
  risk: Risk;
  permission: Permission;
  /** Reversible actions can be executed at trust level 3; the rest need a tap. */
  reversible: boolean;
  /** Shown verbatim on the approval card. Plain language, no jargon. */
  describe: (args: Record<string, unknown>) => string;
};

export const TOOLS: Record<ToolName, ToolDefinition> = {
  get_asset: {
    name: "get_asset",
    risk: "read",
    permission: "asset:read",
    reversible: true,
    describe: () => "Look up asset details",
  },
  get_asset_history: {
    name: "get_asset_history",
    risk: "read",
    permission: "asset:read",
    reversible: true,
    describe: () => "Read this asset's history",
  },
  search_procedure: {
    name: "search_procedure",
    risk: "read",
    permission: "asset:read",
    reversible: true,
    describe: () => "Find the relevant maintenance procedure",
  },
  record_measurement: {
    name: "record_measurement",
    risk: "low",
    permission: "measurement:create",
    reversible: true,
    describe: (a) => `Log ${String(a.metric)} of ${String(a.value)} ${String(a.unit)}`,
  },
  create_incident: {
    name: "create_incident",
    risk: "medium",
    permission: "incident:create",
    reversible: true,
    describe: (a) => `Open a ${String(a.severity)} incident: ${String(a.title)}`,
  },
  create_work_order: {
    name: "create_work_order",
    risk: "medium",
    permission: "work_order:create",
    reversible: true,
    describe: (a) => `Create a ${String(a.priority)} work order: ${String(a.title)}`,
  },
  update_work_order: {
    name: "update_work_order",
    risk: "medium",
    permission: "work_order:update",
    reversible: true,
    describe: (a) => `Set work order status to ${String(a.status)}`,
  },
};

export const isToolAllowed = (name: string): name is ToolName =>
  Object.prototype.hasOwnProperty.call(TOOLS, name);

/** Tools the model may propose from a voice turn. Reads already happened server-side. */
export const PROPOSABLE_TOOLS: ToolName[] = [
  "create_work_order",
  "update_work_order",
  "record_measurement",
  "create_incident",
];
