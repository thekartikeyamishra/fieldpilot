import { sql as raw } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { isModelConfigured } from "@/ai/router";
import { voiceProvider } from "@/integrations/assemblyai/voice-provider";

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

  checks.voiceProvider = voiceProvider.isConfigured()
    ? { ok: true, detail: `assemblyai · ${env.ASSEMBLYAI_SPEECH_MODEL}` }
    : { ok: false, detail: "ASSEMBLYAI_API_KEY missing" };

  checks.modelRouter = isModelConfigured()
    ? { ok: true, detail: `${env.AI_MODEL_FAST} / ${env.AI_MODEL_SMART}` }
    : { ok: false, detail: "no LLM key — the agent will run in degraded mode" };

  const healthy = checks.database.ok;

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
