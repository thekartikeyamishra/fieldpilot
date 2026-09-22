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
export async function GET(request: Request) {
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

  // Host consistency. APP_URL decides where Square sends a buyer after paying
  // and what the session cookie is scoped to in practice. If the host serving
  // this request differs, a customer who pays is returned to a host where they
  // are not signed in — the purchase succeeds and they appear logged out.
  const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
  let appHost = "";
  try {
    appHost = new URL(env.APP_URL).host.toLowerCase();
  } catch {
    appHost = "";
  }
  const isPreview = process.env.VERCEL_ENV === "preview";
  checks.appUrl =
    !appHost || appHost.startsWith("localhost")
      ? { ok: env.NODE_ENV !== "production", detail: `APP_URL is ${env.APP_URL || "unset"} — set it to https://fieldpilot.me in production` }
      : requestHost === appHost || isPreview
        ? { ok: true, detail: `serving ${requestHost}, matches APP_URL` }
        : {
            ok: false,
            detail: `this request came to ${requestHost} but APP_URL is ${appHost}. Sign-in and payment redirects will land on a different host than the user is on.`,
          };

  const healthy = checks.database.ok && checks.rateLimiter.ok && (checks.schema?.ok ?? true);

  return Response.json(
    {
      ok: healthy,
      version: "0.1.0",
      // Which build answered. If fieldpilot.me and the .vercel.app URL report
      // different commits — or fieldpilot.me does not answer this endpoint at
      // all — the domain is attached to a different project or deployment.
      deployment: {
        host: requestHost,
        environment: process.env.VERCEL_ENV ?? env.NODE_ENV,
        commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
        project: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      },
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
