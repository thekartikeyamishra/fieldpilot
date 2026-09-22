import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assets, procedures, sites } from "@/db/schema";
import { parseCsv } from "./csv";

/**
 * Bulk import of the two things a new organisation must load before the product
 * is useful: its assets and its procedures.
 *
 * Design choices, each answering a way imports go wrong in practice:
 *
 *   - Dry run first. The owner sees exactly what will be created and updated
 *     before anything is written.
 *   - All or nothing. One bad row fails the commit rather than leaving half an
 *     asset register loaded and no record of which half.
 *   - Upsert on the natural key. Re-importing a corrected sheet updates rows in
 *     place instead of creating duplicates.
 *   - Duplicates inside one file are an error, not "last one wins". Silent
 *     overwriting is how a register ends up quietly wrong.
 *   - Asset codes are normalised (trimmed, upper-cased). The database uniqueness
 *     check is case-sensitive, so "p-003" and "P-003" would otherwise become two
 *     assets for one machine — and voice resolution would be ambiguous forever.
 */

export type ImportKind = "assets" | "procedures";
export type RowResult = { line: number; key: string; action: "create" | "update" | "error"; message?: string };
export type ImportReport = {
  kind: ImportKind;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  errors: number;
  sitesCreated: number;
  rows: RowResult[];
  committed: boolean;
};

export const REQUIRED: Record<ImportKind, string[]> = {
  assets: ["site", "asset_code", "name", "type"],
  procedures: ["reference", "asset_type", "title", "content"],
};

/**
 * Column aliases real sheets actually use, per file kind. Kept separate because
 * "type" means the asset's type in an asset register but is the natural header
 * for the asset type a procedure applies to — one shared map would silently
 * route a column to the wrong field.
 */
const ALIASES: Record<ImportKind, Record<string, string>> = {
  assets: {
    site_name: "site", location: "site", plant: "site",
    code: "asset_code", tag: "asset_code", asset_tag: "asset_code", asset_id: "asset_code",
    asset_name: "name", equipment: "name",
    asset_type: "type", category: "type", equipment_type: "type",
  },
  procedures: {
    ref: "reference", procedure_reference: "reference", sop: "reference", procedure: "reference",
    type: "asset_type", equipment_type: "asset_type", category: "asset_type",
    body: "content", steps: "content", instructions: "content",
    tags: "keywords", symptoms: "keywords",
  },
};

export function canonical(row: Record<string, string>, kind: ImportKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = ALIASES[kind][k] ?? k;
    // First non-empty value wins if two columns map to the same field.
    if (!out[key]) out[key] = v;
  }
  return out;
}

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "-");
const slug = (s: string) =>
  s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "SITE";

/** "operating_pressure_bar: 6.0-8.2; motor: 15kW" -> { operating_pressure_bar: "6.0-8.2", motor: "15kW" } */
export function parseSpec(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(/[;\n]/)) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const value = part.slice(idx + 1).trim();
    if (key && value) out[key.slice(0, 60)] = value.slice(0, 200);
  }
  return out;
}

const assetRow = z.object({
  site: z.string().trim().min(1, "site is empty").max(120),
  asset_code: z.string().trim().min(1, "asset code is empty").max(40, "asset code is longer than 40 characters"),
  name: z.string().trim().min(1, "name is empty").max(160),
  type: z.string().trim().min(1, "type is empty").max(60),
  status: z.enum(["operational", "degraded", "down", "retired"]).optional(),
  spec: z.string().max(2000).optional(),
  site_code: z.string().max(24).optional(),
});

const procedureRow = z.object({
  reference: z.string().trim().min(1, "reference is empty").max(40),
  asset_type: z.string().trim().min(1, "asset type is empty").max(60),
  title: z.string().trim().min(1, "title is empty").max(200),
  content: z.string().trim().min(10, "content is too short to be a procedure").max(20000),
  keywords: z.string().max(1000).optional(),
  version: z.coerce.number().int().min(1).max(999).optional(),
});

export async function runImport(input: {
  organizationId: string;
  kind: ImportKind;
  csv: string;
  dryRun: boolean;
}): Promise<ImportReport> {
  const parsed = parseCsv(input.csv);
  const canonHeaders = new Set(parsed.headers.map((h) => ALIASES[input.kind][h] ?? h));
  const missing = REQUIRED[input.kind].filter((h) => !canonHeaders.has(h));
  if (missing.length) {
    throw new Error(
      `missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Found: ${parsed.headers.join(", ") || "none"}`,
    );
  }

  return input.kind === "assets"
    ? importAssets(input.organizationId, parsed.rows, parsed.lineOf, input.dryRun)
    : importProcedures(input.organizationId, parsed.rows, parsed.lineOf, input.dryRun);
}

async function importAssets(
  organizationId: string,
  raw: Array<Record<string, string>>,
  lineOf: number[],
  dryRun: boolean,
): Promise<ImportReport> {
  const results: RowResult[] = [];
  const valid: Array<{ line: number; site: string; siteCode: string; code: string; name: string; type: string; status?: string; spec: Record<string, string> }> = [];
  const seen = new Map<string, number>();

  raw.forEach((r, i) => {
    const line = lineOf[i] ?? i + 2;
    const parsed = assetRow.safeParse(canonical(r, "assets"));
    if (!parsed.success) {
      results.push({ line, key: r.asset_code || r.code || r.tag || "?", action: "error", message: parsed.error.issues[0]?.message });
      return;
    }
    const code = normaliseCode(parsed.data.asset_code);
    if (seen.has(code)) {
      results.push({ line, key: code, action: "error", message: `duplicate of line ${seen.get(code)} in this file` });
      return;
    }
    seen.set(code, line);
    valid.push({
      line,
      site: parsed.data.site,
      siteCode: parsed.data.site_code ? slug(parsed.data.site_code) : slug(parsed.data.site),
      code,
      name: parsed.data.name,
      type: parsed.data.type.toLowerCase(),
      status: parsed.data.status,
      spec: parsed.data.spec ? parseSpec(parsed.data.spec) : {},
    });
  });

  const codes = valid.map((v) => v.code);
  const existing = codes.length
    ? await db
        .select({ code: assets.assetCode })
        .from(assets)
        .where(and(eq(assets.organizationId, organizationId), inArray(assets.assetCode, codes)))
    : [];
  const existingCodes = new Set(existing.map((e) => e.code));

  const siteCodes = Array.from(new Set(valid.map((v) => v.siteCode)));
  const existingSites = siteCodes.length
    ? await db
        .select({ id: sites.id, code: sites.code })
        .from(sites)
        .where(and(eq(sites.organizationId, organizationId), inArray(sites.code, siteCodes)))
    : [];
  const siteIdByCode = new Map(existingSites.map((s) => [s.code, s.id]));
  const newSites = siteCodes.filter((c) => !siteIdByCode.has(c));

  for (const v of valid) {
    results.push({ line: v.line, key: v.code, action: existingCodes.has(v.code) ? "update" : "create" });
  }
  results.sort((a, b) => a.line - b.line);

  const errors = results.filter((r) => r.action === "error").length;
  const report: ImportReport = {
    kind: "assets",
    dryRun,
    total: raw.length,
    created: results.filter((r) => r.action === "create").length,
    updated: results.filter((r) => r.action === "update").length,
    errors,
    sitesCreated: newSites.length,
    rows: results,
    committed: false,
  };

  // All or nothing: never load half a register.
  if (dryRun || errors > 0 || valid.length === 0) return report;

  await db.transaction(async (tx) => {
    for (const code of newSites) {
      const name = valid.find((v) => v.siteCode === code)!.site;
      const [row] = await tx
        .insert(sites)
        .values({ organizationId, name, code })
        .onConflictDoUpdate({ target: [sites.organizationId, sites.code], set: { name } })
        .returning({ id: sites.id });
      siteIdByCode.set(code, row.id);
    }

    for (const v of valid) {
      await tx
        .insert(assets)
        .values({
          organizationId,
          siteId: siteIdByCode.get(v.siteCode)!,
          assetCode: v.code,
          name: v.name,
          assetType: v.type,
          status: v.status ?? "operational",
          spec: v.spec,
        })
        .onConflictDoUpdate({
          target: [assets.organizationId, assets.assetCode],
          set: {
            siteId: siteIdByCode.get(v.siteCode)!,
            name: v.name,
            assetType: v.type,
            ...(v.status ? { status: v.status } : {}),
            ...(Object.keys(v.spec).length ? { spec: v.spec } : {}),
          },
        });
    }
  });

  return { ...report, committed: true };
}

async function importProcedures(
  organizationId: string,
  raw: Array<Record<string, string>>,
  lineOf: number[],
  dryRun: boolean,
): Promise<ImportReport> {
  const results: RowResult[] = [];
  const valid: Array<{ line: number; reference: string; assetType: string; title: string; content: string; keywords: string; version: number }> = [];
  const seen = new Map<string, number>();

  raw.forEach((r, i) => {
    const line = lineOf[i] ?? i + 2;
    const parsed = procedureRow.safeParse(canonical(r, "procedures"));
    if (!parsed.success) {
      results.push({ line, key: r.reference || "?", action: "error", message: parsed.error.issues[0]?.message });
      return;
    }
    const reference = normaliseCode(parsed.data.reference);
    if (seen.has(reference)) {
      results.push({ line, key: reference, action: "error", message: `duplicate of line ${seen.get(reference)} in this file` });
      return;
    }
    seen.set(reference, line);
    valid.push({
      line,
      reference,
      assetType: parsed.data.asset_type.toLowerCase(),
      title: parsed.data.title,
      content: parsed.data.content,
      keywords: (parsed.data.keywords ?? "").toLowerCase(),
      version: parsed.data.version ?? 1,
    });
  });

  const refs = valid.map((v) => v.reference);
  const existing = refs.length
    ? await db
        .select({ reference: procedures.reference })
        .from(procedures)
        .where(and(eq(procedures.organizationId, organizationId), inArray(procedures.reference, refs)))
    : [];
  const existingRefs = new Set(existing.map((e) => e.reference));

  for (const v of valid) results.push({ line: v.line, key: v.reference, action: existingRefs.has(v.reference) ? "update" : "create" });
  results.sort((a, b) => a.line - b.line);

  const errors = results.filter((r) => r.action === "error").length;
  const report: ImportReport = {
    kind: "procedures",
    dryRun,
    total: raw.length,
    created: results.filter((r) => r.action === "create").length,
    updated: results.filter((r) => r.action === "update").length,
    errors,
    sitesCreated: 0,
    rows: results,
    committed: false,
  };

  if (dryRun || errors > 0 || valid.length === 0) return report;

  await db.transaction(async (tx) => {
    for (const v of valid) {
      await tx
        .insert(procedures)
        .values({ organizationId, reference: v.reference, assetType: v.assetType, title: v.title, content: v.content, keywords: v.keywords, version: v.version })
        .onConflictDoUpdate({
          target: [procedures.organizationId, procedures.reference],
          set: { assetType: v.assetType, title: v.title, content: v.content, keywords: v.keywords, version: v.version },
        });
    }
  });

  return { ...report, committed: true };
}

/** Templates offered for download, so nobody has to guess column names. */
export const TEMPLATES: Record<ImportKind, string> = {
  assets: [
    "site,asset_code,name,type,status,spec",
    'Plant 2,P-003,Pump 3,pump,operational,"operating_pressure_bar: 6.0-8.2; motor: 15kW"',
    "Plant 2,C-001,Compressor 1,compressor,operational,rated_pressure_bar: 10",
    "Plant 2,PR-004,Press 4,press,degraded,",
  ].join("\r\n"),
  procedures: [
    "reference,asset_type,title,keywords,content",
    'MP-17,pump,Bearing inspection after vibration,"vibration, shaking, rattling, knocking, noise, bearing","1. Isolate and lock out the pump. 2. Inspect the rear bearing for play and scoring. 3. If two vibration incidents occur within 90 days, escalate to a supervisor before restart."',
  ].join("\r\n"),
};
