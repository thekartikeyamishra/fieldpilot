import { sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { isModelConfigured } from "@/ai/router";
import { voiceProvider } from "@/integrations/assemblyai/voice-provider";
import { rateLimiterHealthy } from "@/lib/rate-limit";
import { checkSchema } from "@/lib/schema-check";
import { licenceStatus } from "@/server/licensing/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Boot check. Run this first — it tells you exactly which piece is not wired. */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    await db.execute(raw`select 1`);
    checks.database = { ok: true, detail: "reachable" };
  } catch (error) {
    checks.database = { ok: false, detail: `unreachable: ${String(error).slice(0, 120)}` };
  }

  // A migration that has not been applied should be reported here, in plain
  // language with the fix, rather than as a raw column error on some page.
  if (checks.database.ok) {
    const schema = await checkSchema();
    checks.schema = { ok: schema.ok, detail: schema.detail };
  }

  // A cost-control system that has silently stopped working is worse than none,
  // because you believe you are protected.
  checks.rateLimiter = await rateLimiterHealthy();

  const licence = licenceStatus();
  checks.licence = {
    ok: licence.state === "hosted" || licence.state === "valid" || licence.state === "expiring",
    detail: licence.state === "valid" ? `valid, ${licence.daysRemaining} days remaining` : licence.message ?? licence.state,
  };

  checks.voiceProvider = voiceProvider.isConfigured()
    ? { ok: true, detail: `assemblyai · ${env.ASSEMBLYAI_SPEECH_MODEL}` }
    : { ok: false, detail: "ASSEMBLYAI_API_KEY missing" };

  // Deliberately a configuration check, not a live call: /api/health is polled
  // and a probe on every poll would cost money. But it must not IMPLY the model
  // names are valid — `npm run doctor` is what verifies that against the
  // provider, and this says so rather than reporting a hollow green.
  checks.modelRouter = isModelConfigured()
    ? {
        ok: true,
        detail: `${env.AI_MODEL_FAST} / ${env.AI_MODEL_SMART} — configured, not verified. Run npm run doctor to confirm the provider accepts these names.`,
      }
    : { ok: false, detail: "no LLM key — the agent will run in degraded mode" };

  const healthy = checks.database.ok && checks.rateLimiter.ok && (checks.schema?.ok ?? true);

  return Response.json(
    {
      ok: healthy,
      version: "0.1.0",
      flags: {
        voiceAgent: env.FEATURE_VOICE_AGENT,
        toolExecution: env.FEATURE_TOOL_EXECUTION,
        outcomeLedger: env.FEATURE_OUTCOME_LEDGER,
        demoMode: env.FEATURE_DEMO_MODE,
      },
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
