import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { conversationEvents, voiceSessions } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { cacheGet, cacheKey, cacheSet } from "@/ai/cache";
import { extractJson, isModelConfigured, route } from "@/ai/router";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "@/ai/prompts/system";
import { agentTurnSchema, type AgentTurn } from "@/ai/schemas";
import { clampTranscript, fence, scanForInjection } from "@/ai/safety";
import { recordAudit } from "../audit/audit";
import { checkBudget, recordUsage } from "../cost/governor";
import { resolveContext, type EvidenceItem } from "../context/resolver";
import { proposeToolCall, type ProposedCall } from "../tools/gateway";
import { matchRule, needsReasoning } from "./rules";
import type { Session } from "../auth/session";

/**
 * One spoken turn, end to end:
 *   clamp -> injection scan -> resolve context -> rule layer -> cache ->
 *   budget -> model -> schema validation -> evidence binding -> draft action.
 * Every exit path returns something usable. The demo cannot dead-end.
 */

export type TurnResult = {
  spoken: string;
  recommendation: { text: string; confidence: string } | null;
  question: string | null;
  evidence: EvidenceItem[];
  asset: { id: string; name: string; assetCode: string; siteName: string | null } | null;
  candidates: Array<{ id: string; label: string; assetCode: string }>;
  proposal: (ProposedCall & { summary: string }) | null;
  meta: {
    path: "rule" | "cache" | "model" | "fallback";
    model: string | null;
    tier: string | null;
    latencyMs: number;
    costUsd: number;
    budget: { spentSession: number; limitSession: number };
    degraded: boolean;
    promptVersion: string;
  };
};

export async function runTurn(params: {
  session: Session;
  voiceSessionId: string;
  transcript: string;
}): Promise<TurnResult> {
  const started = Date.now();
  if (!env.FEATURE_VOICE_AGENT) throw new AppError("FEATURE_DISABLED", "voice agent flag off");

  const [vs] = await db
    .select()
    .from(voiceSessions)
    .where(
      and(
        eq(voiceSessions.id, params.voiceSessionId),
        eq(voiceSessions.organizationId, params.session.organizationId),
      ),
    )
    .limit(1);

  if (!vs) throw new AppError("NOT_FOUND", "voice session not found");
  if (vs.status !== "active") throw new AppError("SESSION_LIMIT_REACHED", "session already closed");
  if (Date.now() - vs.startedAt.getTime() > env.VOICE_SESSION_MAX_SECONDS * 1000) {
    await endSession(params.session.organizationId, vs.id, "duration limit");
    throw new AppError("SESSION_LIMIT_REACHED", "session exceeded max duration");
  }

  const transcript = clampTranscript(params.transcript, env.MAX_TRANSCRIPT_CHARS);
  if (!transcript) throw new AppError("VALIDATION_FAILED", "empty transcript");

  const injection = scanForInjection(transcript);
  if (injection.suspicious) {
    await recordAudit({
      organizationId: params.session.organizationId,
      actorType: "system",
      actorId: params.session.userId,
      action: "security.injection_signal",
      resourceType: "voice_session",
      resourceId: vs.id,
      result: "allowed",
      metadata: { patterns: injection.matches.length },
    });
  }

  await appendEvent(params.session.organizationId, vs.id, "technician", "transcript", transcript);

  const history = await recentHistory(vs.id);
  const context = await resolveContext({
    organizationId: params.session.organizationId,
    utterance: [...history.slice(-2).map((h) => h.content), transcript].join(" "),
    siteId: vs.siteId,
    pinnedAssetId: vs.assetId,
  });

  // Pin the asset to the session once identified: later turns skip re-resolution.
  if (context.asset && vs.assetId !== context.asset.id) {
    await db.update(voiceSessions).set({ assetId: context.asset.id }).where(eq(voiceSessions.id, vs.id));
  }

  const assetOut = context.asset
    ? {
        id: context.asset.id,
        name: context.asset.name,
        assetCode: context.asset.assetCode,
        siteName: context.siteName,
      }
    : null;

  const budgetShell = { spentSession: Number(vs.estimatedCostUsd), limitSession: env.AI_COST_LIMIT_PER_SESSION };

  // --- Layer 1: no asset yet? A question is deterministic. No inference needed.
  if (!context.asset) {
    const spoken = context.candidates.length
      ? `I found ${context.candidates.length} possible matches. Which one: ${context.candidates.map((c) => c.label).join(", ")}?`
      : "Which asset are you at? Give me the name or the tag code.";
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: {
        spoken,
        recommendation: null,
        question: spoken,
        evidence: [],
        asset: null,
        candidates: context.candidates,
        proposal: null,
        meta: { path: "rule", model: null, tier: null, latencyMs: Date.now() - started, costUsd: 0, budget: budgetShell, degraded: false, promptVersion: PROMPT_VERSION },
      },
    });
  }

  // --- Layer 2: deterministic rules. Free, instant, unhallucinatable.
  const rule = matchRule(transcript);
  if (rule && rule.kind === "measurement") {
    const proposal = await proposeToolCall({
      session: params.session,
      voiceSessionId: vs.id,
      toolName: "record_measurement",
      args: { metric: rule.metric, value: rule.value, unit: rule.unit },
      assetId: context.asset.id,
      proposedBy: "ai",
    });
    const spoken = `Got it — ${rule.metric} ${rule.value} ${rule.unit} on ${context.asset.name}. Approve to log it.`;
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: {
        spoken,
        recommendation: null,
        question: null,
        evidence: context.evidence.slice(0, 3),
        asset: assetOut,
        candidates: [],
        proposal: { ...proposal, summary: proposal.description },
        meta: { path: "rule", model: null, tier: null, latencyMs: Date.now() - started, costUsd: 0, budget: budgetShell, degraded: false, promptVersion: PROMPT_VERSION },
      },
    });
  }

  // --- Layer 3: exact-match cache within the tenant + asset + utterance.
  const key = cacheKey(params.session.organizationId, context.asset.id, transcript.toLowerCase(), PROMPT_VERSION);
  const cached = cacheGet<AgentTurn>(key);
  if (cached) {
    const built = await buildFromAgentTurn(params.session, vs.id, context, cached);
    await recordUsage({
      organizationId: params.session.organizationId,
      userId: params.session.userId,
      sessionId: vs.id,
      provider: "cache",
      model: "cache",
      taskClass: "diagnosis",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: true,
      cacheHit: true,
    });
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: { ...built, asset: assetOut, candidates: [], meta: { path: "cache", model: "cache", tier: null, latencyMs: Date.now() - started, costUsd: 0, budget: budgetShell, degraded: false, promptVersion: PROMPT_VERSION } },
    });
  }

  // --- Layer 4/5: paid inference, only now, and only inside a budget decision.
  const desiredTier = needsReasoning(transcript) ? "smart" : "fast";
  const promptContext = {
    technicianName: params.session.name,
    role: params.session.role,
    siteName: context.siteName,
    asset: {
      name: context.asset.name,
      assetCode: context.asset.assetCode,
      assetType: context.asset.assetType,
      status: context.asset.status,
      spec: context.asset.spec,
    },
    candidates: [],
    evidence: context.evidence.map((e) => ({ ref: e.ref, label: e.label, excerpt: e.excerpt, occurredAt: e.occurredAt })),
    history: history.map((h) => ({ speaker: h.speaker, content: h.content })),
    transcript,
  };

  const userPrompt = fence("field-transcript-and-records", buildUserPrompt(promptContext), 6000);

  let budget;
  try {
    budget = await checkBudget({
      organizationId: params.session.organizationId,
      userId: params.session.userId,
      sessionId: vs.id,
      desiredTier,
      estimatedInputChars: userPrompt.length,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "SESSION_LIMIT_REACHED") throw error;
    throw error;
  }

  const budgetOut = { spentSession: budget.spent.session, limitSession: env.AI_COST_LIMIT_PER_SESSION };

  if (budget.verdict === "stop" || !isModelConfigured()) {
    const degraded = degradedTurn(context, transcript);
    const built = await buildFromAgentTurn(params.session, vs.id, context, degraded);
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: { ...built, asset: assetOut, candidates: [], meta: { path: "fallback", model: null, tier: null, latencyMs: Date.now() - started, costUsd: 0, budget: budgetOut, degraded: true, promptVersion: PROMPT_VERSION } },
    });
  }

  try {
    const completion = await route({
      taskClass: "diagnosis",
      tier: budget.tier,
      json: true,
      maxTokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const cost = await recordUsage({
      organizationId: params.session.organizationId,
      userId: params.session.userId,
      sessionId: vs.id,
      provider: completion.provider,
      model: completion.model,
      taskClass: "diagnosis",
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      latencyMs: completion.latencyMs,
      success: true,
      fallbackUsed: completion.fallbackUsed,
    });

    const parsed = agentTurnSchema.safeParse(extractJson(completion.text));
    const turn = parsed.success ? parsed.data : degradedTurn(context, transcript);
    if (!parsed.success) log.warn("agent_output_invalid", { issues: parsed.error.issues.length });
    else cacheSet(key, turn, 900);

    const built = await buildFromAgentTurn(params.session, vs.id, context, turn);
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: {
        ...built,
        asset: assetOut,
        candidates: [],
        meta: {
          path: parsed.success ? "model" : "fallback",
          model: completion.model,
          tier: budget.tier,
          latencyMs: Date.now() - started,
          costUsd: cost,
          budget: budgetOut,
          degraded: budget.verdict === "degrade",
          promptVersion: PROMPT_VERSION,
        },
      },
    });
  } catch (error) {
    // The provider is down. The technician still gets context, evidence and an action.
    log.warn("model_unavailable_degrading", { error: String(error) });
    await recordUsage({
      organizationId: params.session.organizationId,
      userId: params.session.userId,
      sessionId: vs.id,
      provider: "unavailable",
      model: "none",
      taskClass: "diagnosis",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
    });

    const built = await buildFromAgentTurn(params.session, vs.id, context, degradedTurn(context, transcript));
    return finish({
      session: params.session,
      voiceSessionId: vs.id,
      started,
      result: { ...built, asset: assetOut, candidates: [], meta: { path: "fallback", model: null, tier: null, latencyMs: Date.now() - started, costUsd: 0, budget: budgetOut, degraded: true, promptVersion: PROMPT_VERSION } },
    });
  }
}

/**
 * Binds a validated model output to reality: evidence refs are matched against
 * the server's list (unknown refs are dropped, never rendered) and any proposal
 * goes through the tool gateway rather than straight to the database.
 */
async function buildFromAgentTurn(
  session: Session,
  voiceSessionId: string,
  context: Awaited<ReturnType<typeof resolveContext>>,
  turn: AgentTurn,
): Promise<Omit<TurnResult, "asset" | "candidates" | "meta">> {
  const byRef = new Map(context.evidence.map((e) => [e.ref.toUpperCase(), e]));
  const evidence = turn.evidenceRefs
    .map((r) => byRef.get(String(r).toUpperCase()))
    .filter((e): e is EvidenceItem => Boolean(e));

  let proposal: (ProposedCall & { summary: string }) | null = null;

  if (turn.proposal && context.asset) {
    try {
      const created = await proposeToolCall({
        session,
        voiceSessionId,
        toolName: turn.proposal.tool,
        args: turn.proposal.args,
        assetId: context.asset.id,
        proposedBy: "ai",
      });
      proposal = { ...created, summary: created.description };
    } catch (error) {
      // A rejected proposal is not a failed turn. The advice still stands.
      log.warn("proposal_rejected", { tool: turn.proposal.tool, error: String(error) });
    }
  }

  await appendEvent(session.organizationId, voiceSessionId, "agent", "response", turn.spoken, {
    recommendation: turn.recommendation?.text ?? null,
    evidenceRefs: evidence.map((e) => e.ref),
    proposedTool: proposal?.toolName ?? null,
  });

  return {
    spoken: turn.spoken,
    recommendation: turn.recommendation,
    question: turn.question,
    evidence: evidence.length ? evidence : context.evidence.slice(0, 3),
    proposal,
  };
}

/** Honest degradation: real records, no invented reasoning, explicit limits. */
function degradedTurn(context: Awaited<ReturnType<typeof resolveContext>>, transcript: string): AgentTurn {
  const asset = context.asset;
  const incidentCount = context.incidents.length;
  const procedure = context.procedures[0];

  const parts = [`${asset?.name ?? "This asset"}:`];
  parts.push(incidentCount ? `${incidentCount} previous incidents on record.` : "no previous incidents on record.");
  if (procedure) parts.push(`Procedure ${procedure.reference} applies.`);
  parts.push("Analysis is limited right now, so review the evidence and decide.");

  return {
    spoken: parts.join(" "),
    understanding: { problem: transcript.slice(0, 200), missing: [] },
    recommendation: procedure
      ? { text: `Follow ${procedure.reference}: ${procedure.title}. Confirm with a supervisor before restarting.`, confidence: "low" }
      : null,
    evidenceRefs: context.evidence.slice(0, 3).map((e) => e.ref),
    question: null,
    proposal: null,
  };
}

async function finish(args: {
  session: Session;
  voiceSessionId: string;
  started: number;
  result: TurnResult;
}): Promise<TurnResult> {
  await db
    .update(voiceSessions)
    .set({ durationMs: Date.now() - args.started })
    .where(eq(voiceSessions.id, args.voiceSessionId));
  return args.result;
}

async function appendEvent(
  organizationId: string,
  sessionId: string,
  speaker: string,
  eventType: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const [last] = await db
    .select({ sequence: conversationEvents.sequence })
    .from(conversationEvents)
    .where(eq(conversationEvents.sessionId, sessionId))
    .orderBy(desc(conversationEvents.sequence))
    .limit(1);

  await db.insert(conversationEvents).values({
    organizationId,
    sessionId,
    sequence: (last?.sequence ?? 0) + 1,
    speaker,
    eventType,
    content: content.slice(0, 4000),
    metadata,
  });
}

async function recentHistory(sessionId: string) {
  const rows = await db
    .select()
    .from(conversationEvents)
    .where(eq(conversationEvents.sessionId, sessionId))
    .orderBy(desc(conversationEvents.sequence))
    .limit(6);
  return rows.reverse().map((r) => ({ speaker: r.speaker, content: r.content }));
}

export async function endSession(organizationId: string, sessionId: string, reason?: string) {
  await db
    .update(voiceSessions)
    .set({ status: "ended", endedAt: new Date(), failureReason: reason ?? null })
    .where(and(eq(voiceSessions.id, sessionId), eq(voiceSessions.organizationId, organizationId)));
}
