import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pooled client per process. Next.js hot-reload would otherwise leak
 * connections on every file save, so the client is cached on globalThis.
 */
const globalForDb = globalThis as unknown as { __fieldpilotSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__fieldpilotSql ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (env.NODE_ENV !== "production") globalForDb.__fieldpilotSql = sql;

export const db = drizzle(sql, { schema });
export { sql, schema };
