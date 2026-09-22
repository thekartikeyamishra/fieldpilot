import { sql as client } from "@/db/client";

/**
 * Detects a database running behind the code.
 *
 * Without this, a missing migration surfaces as a raw Postgres error on
 * whichever page happens to touch the new column first — which tells the
 * operator nothing about the actual cause or the one-line fix. A schema check
 * belongs in the health endpoint, where you look before you trust a deployment.
 */

/** Columns added after the initial schema. Extend when a migration adds one. */
const EXPECTED: Array<{ table: string; column?: string }> = [
  { table: "organizations" },
  { table: "users" },
  { table: "assets" },
  { table: "work_orders", column: "org_number" },
  { table: "voice_sessions" },
  { table: "outcomes" },
  { table: "ai_usage" },
  { table: "analytics_events" },
  { table: "organization_credits" },
  { table: "credit_ledger" },
  { table: "payments" },
  { table: "webhook_events" },
  { table: "rate_limits" },
  { table: "invites" },
];

export type SchemaCheck = { ok: boolean; detail: string; missing: string[] };

export async function checkSchema(): Promise<SchemaCheck> {
  try {
    const tables = new Set(
      (
        (await client`select table_name from information_schema.tables where table_schema = 'public'`) as unknown as Array<{
          table_name: string;
        }>
      ).map((r) => r.table_name),
    );

    const columns = new Set(
      (
        (await client`select table_name, column_name from information_schema.columns where table_schema = 'public'`) as unknown as Array<{
          table_name: string;
          column_name: string;
        }>
      ).map((r) => `${r.table_name}.${r.column_name}`),
    );

    const missing: string[] = [];
    for (const expected of EXPECTED) {
      if (!tables.has(expected.table)) missing.push(expected.table);
      else if (expected.column && !columns.has(`${expected.table}.${expected.column}`)) {
        missing.push(`${expected.table}.${expected.column}`);
      }
    }

    if (missing.length) {
      return {
        ok: false,
        missing,
        detail: `database is behind the code — missing ${missing.join(", ")}. Run: npm run db:push (or npm run db:migrate in production)`,
      };
    }

    return { ok: true, missing: [], detail: `${tables.size} tables, schema current` };
  } catch (error) {
    return { ok: false, missing: [], detail: `could not inspect schema: ${String(error).slice(0, 120)}` };
  }
}
