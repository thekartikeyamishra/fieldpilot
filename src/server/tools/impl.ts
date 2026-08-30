import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, incidents, measurements, procedures, workOrders } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { rankProcedures } from "../context/resolver";
import type { ToolName } from "./registry";

export type ToolExecutionContext = {
  organizationId: string;
  userId: string;
  sessionId: string | null;
  /** Bound by the platform, never by the model. */
  assetId: string | null;
};

export type ToolResult = {
  summary: string;
  data: Record<string, unknown>;
  resourceType: string;
  resourceId: string | null;
};

/** Every write re-verifies tenant ownership at the query, not in the caller. */
async function ownedAsset(organizationId: string, assetId: string | null) {
  if (!assetId) throw new AppError("VALIDATION_FAILED", "no asset bound to this action");
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.organizationId, organizationId)))
    .limit(1);
  if (!asset) throw new AppError("NOT_FOUND", "asset not found in this organisation");
  return asset;
}

export const executors: Record<
  ToolName,
  (args: any, ctx: ToolExecutionContext) => Promise<ToolResult>
> = {
  get_asset: async (args, ctx) => {
    const asset = await ownedAsset(ctx.organizationId, args.assetId);
    return {
      summary: `${asset.name} (${asset.assetCode})`,
      data: { asset },
      resourceType: "asset",
      resourceId: asset.id,
    };
  },

  get_asset_history: async (args, ctx) => {
    const asset = await ownedAsset(ctx.organizationId, args.assetId);
    const rows = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.organizationId, ctx.organizationId), eq(incidents.assetId, asset.id)))
      .orderBy(desc(incidents.createdAt))
      .limit(args.limit ?? 5);
    return {
      summary: `${rows.length} previous incidents`,
      data: { incidents: rows },
      resourceType: "asset",
      resourceId: asset.id,
    };
  },

  search_procedure: async (args, ctx) => {
    const rows = await db
      .select()
      .from(procedures)
      .where(and(eq(procedures.organizationId, ctx.organizationId), eq(procedures.status, "active")))
      .limit(20);
    const ranked = rankProcedures(rows, args.query).slice(0, 3);
    return {
      summary: ranked.length ? `Matched ${ranked[0].reference}` : "No procedure matched",
      data: { procedures: ranked },
      resourceType: "procedure",
      resourceId: ranked[0]?.id ?? null,
    };
  },

  record_measurement: async (args, ctx) => {
    const asset = await ownedAsset(ctx.organizationId, ctx.assetId);
    const [row] = await db
      .insert(measurements)
      .values({
        organizationId: ctx.organizationId,
        assetId: asset.id,
        recordedBy: ctx.userId,
        metric: args.metric,
        value: String(args.value),
        unit: args.unit,
        source: "voice",
      })
      .returning();
    return {
      summary: `${args.metric} ${args.value} ${args.unit} recorded on ${asset.name}`,
      data: { measurement: row },
      resourceType: "measurement",
      resourceId: row.id,
    };
  },

  create_incident: async (args, ctx) => {
    const asset = await ownedAsset(ctx.organizationId, ctx.assetId);
    const [row] = await db
      .insert(incidents)
      .values({
        organizationId: ctx.organizationId,
        assetId: asset.id,
        reportedBy: ctx.userId,
        title: args.title,
        description: args.description ?? "",
        severity: args.severity ?? "medium",
        status: "open",
      })
      .returning();
    return {
      summary: `Incident opened on ${asset.name}`,
      data: { incident: row },
      resourceType: "incident",
      resourceId: row.id,
    };
  },

  create_work_order: async (args, ctx) => {
    const asset = await ownedAsset(ctx.organizationId, ctx.assetId);
    const [row] = await db
      .insert(workOrders)
      .values({
        organizationId: ctx.organizationId,
        assetId: asset.id,
        createdBy: ctx.userId,
        assignedTo: ctx.userId,
        title: args.title,
        description: args.description ?? "",
        priority: args.priority ?? "normal",
        status: "open",
        sourceSessionId: ctx.sessionId,
      })
      .returning();
    return {
      summary: `Work order #${row.number} created as ${row.priority}`,
      data: { workOrder: row },
      resourceType: "work_order",
      resourceId: row.id,
    };
  },

  update_work_order: async (args, ctx) => {
    const [existing] = await db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, args.workOrderId), eq(workOrders.organizationId, ctx.organizationId)))
      .limit(1);
    if (!existing) throw new AppError("NOT_FOUND", "work order not found in this organisation");

    const [row] = await db
      .update(workOrders)
      .set({
        status: args.status,
        updatedAt: new Date(),
        completedAt: args.status === "completed" ? new Date() : existing.completedAt,
      })
      .where(eq(workOrders.id, existing.id))
      .returning();

    return {
      summary: `Work order #${row.number} is now ${row.status}`,
      data: { workOrder: row },
      resourceType: "work_order",
      resourceId: row.id,
    };
  },
};
