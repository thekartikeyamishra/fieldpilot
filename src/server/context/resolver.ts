import "server-only";
import { and, desc, eq, ilike, or, sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, incidents, measurements, procedures, sites, workOrders } from "@/db/schema";
import type { Asset, Incident, Measurement, Procedure } from "@/db/schema";

/**
 * Context retrieval. The model never receives the organisation's database —
 * only the user, the site, one asset, its recent history and one procedure.
 * That single decision controls cost, latency, privacy and hallucination at once.
 */

export const CONTEXT_LIMITS = {
  incidents: 5,
  measurements: 5,
  procedures: 2,
  openWorkOrders: 3,
  procedureExcerptChars: 700,
} as const;

export type EvidenceItem = {
  ref: string; // E1, E2 ... the model may only cite these
  sourceType: "incident" | "measurement" | "procedure" | "work_order" | "asset";
  sourceId: string;
  label: string;
  excerpt: string;
  occurredAt: string | null;
};

export type ResolvedContext = {
  asset: Asset | null;
  siteName: string | null;
  candidates: Array<{ id: string; label: string; assetCode: string }>;
  ambiguous: boolean;
  incidents: Incident[];
  measurements: Measurement[];
  procedures: Procedure[];
  evidence: EvidenceItem[];
};

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

/** "pump three" -> "pump 3". Spoken language rarely contains digits. */
export function normaliseSpokenNumbers(text: string): string {
  return text.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    (m) => NUMBER_WORDS[m.toLowerCase()] ?? m,
  );
}

/**
 * Deterministic asset matching, before any model call. This is layer 2 of the
 * cost cascade: most utterances name their asset plainly and need no inference.
 */
export function scoreAsset(asset: Pick<Asset, "name" | "assetCode" | "assetType">, utterance: string): number {
  const text = normaliseSpokenNumbers(utterance.toLowerCase());
  const name = asset.name.toLowerCase();
  const code = asset.assetCode.toLowerCase();
  let score = 0;

  if (text.includes(code)) score += 100;
  if (text.includes(name)) score += 80;

  const nameParts = name.split(/[\s-]+/).filter(Boolean);
  const matchedParts = nameParts.filter((p) => new RegExp(`\\b${escapeRegex(p)}\\b`).test(text));
  if (nameParts.length && matchedParts.length === nameParts.length) score += 60;
  else score += matchedParts.length * 12;

  if (text.includes(asset.assetType.toLowerCase())) score += 8;
  return score;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function resolveContext(params: {
  organizationId: string;
  utterance: string;
  siteId?: string | null;
  pinnedAssetId?: string | null;
}): Promise<ResolvedContext> {
  const { organizationId, utterance } = params;

  // Candidate selection happens in SQL, not in memory.
  //
  // The previous version loaded the first 500 assets and scored them in Node.
  // For an organisation with 10,000 assets that silently scored an arbitrary
  // 5% of them, so "Pump 3" could resolve to nothing while Pump 3 sat in the
  // database. Wrong answers at scale are worse than slow ones.
  const orgAssets = await loadCandidates(organizationId, params.siteId ?? null, utterance);

  let asset: Asset | null = null;
  let candidates: ResolvedContext["candidates"] = [];
  let ambiguous = false;

  if (params.pinnedAssetId) {
    asset = orgAssets.find((a) => a.id === params.pinnedAssetId) ?? null;
  }

  if (!asset) {
    const scored = orgAssets
      .map((a) => ({ asset: a, score: scoreAsset(a, utterance) }))
      .filter((s) => s.score >= 40)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 30)) {
      asset = scored[0].asset;
    } else if (scored.length > 1) {
      ambiguous = true;
      candidates = scored.slice(0, 4).map((s) => ({
        id: s.asset.id,
        label: s.asset.name,
        assetCode: s.asset.assetCode,
      }));
    }
  }

  if (!asset) {
    return { asset: null, siteName: null, candidates, ambiguous, incidents: [], measurements: [], procedures: [], evidence: [] };
  }

  const [site] = await db.select().from(sites).where(eq(sites.id, asset.siteId)).limit(1);

  const [assetIncidents, assetMeasurements, matchedProcedures, openWork] = await Promise.all([
    db.select().from(incidents)
      .where(and(eq(incidents.organizationId, organizationId), eq(incidents.assetId, asset.id)))
      .orderBy(desc(incidents.createdAt)).limit(CONTEXT_LIMITS.incidents),
    db.select().from(measurements)
      .where(and(eq(measurements.organizationId, organizationId), eq(measurements.assetId, asset.id)))
      .orderBy(desc(measurements.recordedAt)).limit(CONTEXT_LIMITS.measurements),
    db.select().from(procedures)
      .where(and(
        eq(procedures.organizationId, organizationId),
        eq(procedures.status, "active"),
        eq(procedures.assetType, asset.assetType),
      ))
      .limit(8),
    db.select().from(workOrders)
      .where(and(
        eq(workOrders.organizationId, organizationId),
        eq(workOrders.assetId, asset.id),
        eq(workOrders.status, "open"),
      ))
      .orderBy(desc(workOrders.createdAt)).limit(CONTEXT_LIMITS.openWorkOrders),
  ]);

  const rankedProcedures = rankProcedures(matchedProcedures, utterance).slice(0, CONTEXT_LIMITS.procedures);

  // Evidence refs are minted server-side. The model cites E1..En and cannot
  // invent an identifier, because anything it returns is matched back to this list.
  const evidence: EvidenceItem[] = [];
  const push = (item: Omit<EvidenceItem, "ref">) =>
    evidence.push({ ref: `E${evidence.length + 1}`, ...item });

  for (const inc of assetIncidents) {
    push({
      sourceType: "incident",
      sourceId: inc.id,
      label: `Incident: ${inc.title}`,
      excerpt: `${inc.severity} severity, ${inc.status}. ${inc.description}`.slice(0, 240),
      occurredAt: inc.createdAt.toISOString(),
    });
  }
  for (const m of assetMeasurements) {
    push({
      sourceType: "measurement",
      sourceId: m.id,
      label: `${m.metric}: ${m.value} ${m.unit}`,
      excerpt: `Recorded ${m.recordedAt.toISOString().slice(0, 10)} via ${m.source}.`,
      occurredAt: m.recordedAt.toISOString(),
    });
  }
  for (const p of rankedProcedures) {
    push({
      sourceType: "procedure",
      sourceId: p.id,
      label: `${p.reference} v${p.version}: ${p.title}`,
      excerpt: p.content.slice(0, CONTEXT_LIMITS.procedureExcerptChars),
      occurredAt: null,
    });
  }
  for (const wo of openWork) {
    push({
      sourceType: "work_order",
      sourceId: wo.id,
      label: `Open work order #${wo.number}: ${wo.title}`,
      excerpt: `${wo.priority} priority, opened ${wo.createdAt.toISOString().slice(0, 10)}.`,
      occurredAt: wo.createdAt.toISOString(),
    });
  }

  return {
    asset,
    siteName: site?.name ?? null,
    candidates,
    ambiguous: false,
    incidents: assetIncidents,
    measurements: assetMeasurements,
    procedures: rankedProcedures,
    evidence,
  };
}

/** Keyword overlap ranking. Cheap, deterministic, good enough at this corpus size. */
export function rankProcedures(list: Procedure[], utterance: string): Procedure[] {
  const words = new Set(
    normaliseSpokenNumbers(utterance.toLowerCase()).split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  return list
    .map((p) => {
      const haystack = `${p.title} ${p.keywords}`.toLowerCase();
      let score = 0;
      for (const w of words) if (haystack.includes(w)) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || a.p.reference.localeCompare(b.p.reference))
    .map((x) => x.p);
}

/**
 * Narrow to plausible assets in the database, then score the short list.
 * Bounded work regardless of tenant size.
 */
async function loadCandidates(
  organizationId: string,
  siteId: string | null,
  utterance: string,
): Promise<Asset[]> {
  const scoped = siteId
    ? and(eq(assets.organizationId, organizationId), eq(assets.siteId, siteId))
    : eq(assets.organizationId, organizationId);

  // Tokens survive script and language: "पंप 3" and "pump three" both yield "3".
  const normalised = normaliseSpokenNumbers(utterance.toLowerCase());
  const tokens = Array.from(
    new Set((normalised.match(/[a-z][a-z0-9-]{1,}|\d{1,6}/g) ?? []).filter((t) => t.length >= 2)),
  ).slice(0, 12);

  if (tokens.length) {
    const matches = await db
      .select()
      .from(assets)
      .where(and(scoped, or(...tokens.flatMap((t) => [ilike(assets.name, `%${t}%`), ilike(assets.assetCode, `%${t}%`)]))))
      .limit(60);
    if (matches.length) return matches;
  }

  // Nothing matched textually. Return a small slice only so a tiny organisation
  // still resolves by type alone; a large one correctly falls through to
  // "which asset?" rather than guessing from an arbitrary 500.
  return db.select().from(assets).where(scoped).limit(25);
}

export async function listAssetsForOrg(organizationId: string, limit = 100) {
  return db
    .select({
      id: assets.id,
      name: assets.name,
      assetCode: assets.assetCode,
      assetType: assets.assetType,
      status: assets.status,
      siteId: assets.siteId,
      siteName: sites.name,
      openIncidents: raw<number>`(
        select count(*)::int from incidents i
        where i.asset_id = ${assets.id} and i.status = 'open'
      )`,
    })
    .from(assets)
    .innerJoin(sites, eq(sites.id, assets.siteId))
    .where(eq(assets.organizationId, organizationId))
    .orderBy(assets.assetCode)
    .limit(limit);
}

export async function searchAssets(organizationId: string, query: string, limit = 10) {
  const q = `%${query}%`;
  return db
    .select()
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), or(ilike(assets.name, q), ilike(assets.assetCode, q))))
    .limit(limit);
}
