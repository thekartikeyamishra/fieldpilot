import { createHash } from "node:crypto";
import { sql as client } from "@/db/client";

/**
 * Streaming export.
 *
 * The previous version issued thirteen unbounded SELECTs and held every row in
 * memory before serialising. Fine for a demo tenant, fatal for a real one: a few
 * hundred thousand conversation events exhaust a serverless function's memory
 * and the export simply fails — precisely for the customer who most needs to get
 * their data out.
 *
 * This pages through each table with keyset pagination and writes JSON as it
 * goes, hashing each entity incrementally. Memory stays flat at one page.
 */

const PAGE = 500;

export type EntitySpec = { name: string; table: string; columns: string[] };

/** Password hashes and secrets are excluded by naming columns explicitly, never `*`. */
export const EXPORT_ENTITIES: EntitySpec[] = [
  { name: "organizations", table: "organizations", columns: ["id", "name", "plan", "created_at"] },
  { name: "users", table: "users", columns: ["id", "name", "email", "role", "status", "created_at"] },
  { name: "sites", table: "sites", columns: ["id", "name", "code", "location", "created_at"] },
  { name: "assets", table: "assets", columns: ["id", "site_id", "name", "asset_code", "asset_type", "status", "spec", "created_at"] },
  { name: "incidents", table: "incidents", columns: ["id", "asset_id", "title", "description", "severity", "status", "created_at", "resolved_at"] },
  { name: "measurements", table: "measurements", columns: ["id", "asset_id", "metric", "value", "unit", "source", "recorded_at"] },
  { name: "procedures", table: "procedures", columns: ["id", "reference", "asset_type", "title", "version", "content", "status", "created_at"] },
  { name: "work_orders", table: "work_orders", columns: ["id", "org_number", "asset_id", "title", "description", "priority", "status", "created_at", "completed_at"] },
  { name: "voice_sessions", table: "voice_sessions", columns: ["id", "user_id", "site_id", "asset_id", "status", "duration_ms", "started_at", "ended_at"] },
  { name: "conversation_events", table: "conversation_events", columns: ["id", "session_id", "sequence", "speaker", "event_type", "content", "created_at"] },
  { name: "tool_calls", table: "tool_calls", columns: ["id", "session_id", "tool_name", "arguments", "risk", "authorization_status", "execution_status", "created_at"] },
  { name: "outcomes", table: "outcomes", columns: ["id", "session_id", "asset_id", "work_order_id", "problem_summary", "recommendation", "action", "evidence", "minutes_returned", "created_at"] },
  { name: "audit_events", table: "audit_events", columns: ["id", "actor_type", "actor_id", "action", "resource_type", "resource_id", "result", "created_at"] },
  { name: "payments", table: "payments", columns: ["id", "provider", "purpose", "sku", "credits_granted", "amount_minor", "currency", "status", "created_at"] },
];

/** Identifiers come from this file only, never from a request. Belt and braces. */
const IDENT = /^[a-z_]+$/;
export const assertIdentifier = (value: string) => {
  if (!IDENT.test(value)) throw new Error(`refusing unsafe identifier: ${value}`);
  return value;
};

export type ExportProgress = { entity: string; rows: number };

export function exportStream(
  organizationId: string,
  onProgress?: (p: ExportProgress) => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const counts: Record<string, number> = {};
  const checksums: Record<string, string> = {};

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));

      try {
        write('{\n  "entities": {\n');

        for (let e = 0; e < EXPORT_ENTITIES.length; e++) {
          const spec = EXPORT_ENTITIES[e];
          const table = assertIdentifier(spec.table);
          const columns = spec.columns.map(assertIdentifier).join(", ");
          const scopeColumn = spec.table === "organizations" ? "id" : "organization_id";
          const hash = createHash("sha256");
          let rows = 0;
          let cursor: string | null = null;

          write(`    ${JSON.stringify(spec.name)}: [`);

          // Keyset pagination: stable under concurrent inserts, and it does not
          // degrade the way OFFSET does once a table is large.
          for (;;) {
            const page = (await client.unsafe(
              `select ${columns} from ${table} where ${scopeColumn} = $1 ${cursor ? "and id > $2" : ""} order by id asc limit ${PAGE}`,
              cursor ? [organizationId, cursor] : [organizationId],
            )) as unknown as Array<Record<string, unknown>>;

            for (const row of page) {
              const json = JSON.stringify(row);
              hash.update(json);
              write(`${rows === 0 ? "" : ","}\n      ${json}`);
              rows++;
            }

            if (page.length < PAGE) break;
            cursor = String(page[page.length - 1].id);
          }

          write(rows ? "\n    ]" : "]");
          write(e === EXPORT_ENTITIES.length - 1 ? "\n" : ",\n");

          counts[spec.name] = rows;
          checksums[spec.name] = hash.digest("hex");
          onProgress?.({ entity: spec.name, rows });
        }

        write("  },\n");
        write(
          `  "manifest": ${JSON.stringify(
            {
              exportVersion: 2,
              productVersion: "0.1.0",
              schemaVersion: 2,
              createdAt: new Date().toISOString(),
              organizationId,
              entityCounts: counts,
              checksumAlgorithm: "sha256",
              checksums,
              note: "Each checksum is sha256 over the concatenated JSON of that entity's rows, in id order, exactly as emitted here.",
            },
            null,
            2,
          )}\n}\n`,
        );

        controller.close();
      } catch (error) {
        // Bytes are already on the wire, so we cannot switch to a clean error
        // response. Close with an explicit marker rather than truncating: a
        // half-file that looks complete is the worst possible outcome.
        write(`\n  ,"error": ${JSON.stringify(String(error).slice(0, 200))}\n}\n`);
        controller.close();
      }
    },
  });
}
