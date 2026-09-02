import "../src/lib/load-env";
import { existsSync } from "node:fs";

/**
 * One command that tells you which piece is broken, in the order that matters.
 * Runs without a server: this is what you use when `npm run dev` will not start.
 */

type Check = { name: string; ok: boolean; detail: string; fix?: string };
const results: Check[] = [];

const add = (name: string, ok: boolean, detail: string, fix?: string) =>
  results.push({ name, ok, detail, fix });

async function main() {
  // --- 1. Runtime -----------------------------------------------------------
  const major = Number(process.versions.node.split(".")[0]);
  add("Node.js", major >= 22, `v${process.versions.node}`, "Install Node 22+ from https://nodejs.org");

  // --- 2. Config file -------------------------------------------------------
  const hasEnvFile = existsSync(".env.local") || existsSync(".env");
  add("Env file", hasEnvFile, hasEnvFile ? "found" : "no .env.local", "Copy .env.example to .env.local");

  const secret = process.env.AUTH_SECRET ?? "";
  add(
    "AUTH_SECRET",
    secret.length >= 32,
    secret ? `${secret.length} characters` : "not set",
    'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );

  // --- 3. Database ----------------------------------------------------------
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl) {
    add("Database", false, "DATABASE_URL not set", "Set it in .env.local, then: docker compose up -d");
  } else {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres(dbUrl, { max: 1, connect_timeout: 5, prepare: false });
      const [row] = await sql<{ tables: number }[]>`
        select count(*)::int as tables from information_schema.tables where table_schema = 'public'
      `;
      await sql.end();
      add("Database", true, `reachable, ${row.tables} tables`, row.tables === 0 ? "Run: npm run db:push" : undefined);
      if (row.tables === 0) add("Schema", false, "no tables yet", "npm run db:push && npm run seed");
      else add("Schema", true, `${row.tables} tables present`);
    } catch (error) {
      add("Database", false, String(error).slice(0, 120), "docker compose up -d  (then check docker compose ps)");
    }
  }

  // --- 4. AssemblyAI --------------------------------------------------------
  const aaiKey = process.env.ASSEMBLYAI_API_KEY ?? "";
  if (!aaiKey) {
    add("AssemblyAI key", false, "not set", "Add ASSEMBLYAI_API_KEY to .env.local (voice needs it)");
  } else {
    const host = process.env.ASSEMBLYAI_STREAMING_HOST ?? "streaming.assemblyai.com";
    try {
      const res = await fetch(`https://${host}/v3/token?expires_in_seconds=60`, {
        headers: { Authorization: aaiKey },
        signal: AbortSignal.timeout(8000),
      });
      add(
        "AssemblyAI key",
        res.ok,
        res.ok ? "accepted, token minted" : `rejected (${res.status})`,
        res.ok ? undefined : "Check the key in your AssemblyAI dashboard",
      );
    } catch (error) {
      add("AssemblyAI key", false, `could not reach ${host}: ${String(error).slice(0, 60)}`, "Check your network or proxy");
    }
  }

  // --- 5. LLM ---------------------------------------------------------------
  const aiKey = process.env.AI_API_KEY || aaiKey;
  const baseUrl = process.env.AI_BASE_URL ?? "https://llm-gateway.assemblyai.com/v1";
  const fast = process.env.AI_MODEL_FAST ?? "gpt-4o-mini";

  if (!aiKey) {
    add("LLM", false, "no key", "The agent will run degraded. Set AI_API_KEY or ASSEMBLYAI_API_KEY.");
  } else {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({ model: fast, messages: [{ role: "user", content: "reply with: ok" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        add("LLM", true, `${fast} responded via ${new URL(baseUrl).host}`);
      } else {
        const body = await res.text().catch(() => "");
        add("LLM", false, `${res.status}: ${body.slice(0, 90)}`, `Try a different AI_MODEL_FAST — model names change`);
      }
    } catch (error) {
      add("LLM", false, String(error).slice(0, 90), "Check AI_BASE_URL and your network");
    }
  }

  // --- Report ---------------------------------------------------------------
  console.log("\nFieldPilot doctor\n");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(16)} ${r.detail}`);
    if (!r.ok && r.fix) console.log(`        fix: ${r.fix}`);
  }

  const blocking = results.filter((r) => !r.ok && ["Node.js", "AUTH_SECRET", "Database", "Schema"].includes(r.name));
  const degraded = results.filter((r) => !r.ok && !blocking.includes(r));

  console.log("");
  if (blocking.length) {
    console.log(`  ${blocking.length} blocking problem(s). The app will not start until these are fixed.\n`);
    process.exit(1);
  }
  if (degraded.length) {
    console.log("  Ready to run, with reduced capability:");
    for (const d of degraded) console.log(`    - ${d.name}: ${d.detail}`);
    console.log("  Typed input, orchestration, approvals and the ledger all still work.\n");
  } else {
    console.log("  Everything is wired. Run: npm run dev\n");
  }
}

main().catch((error) => {
  console.error("doctor failed:", error);
  process.exit(1);
});
