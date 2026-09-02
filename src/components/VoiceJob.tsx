"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Legend, Panel, Tag } from "./ui";
import { speak, stopSpeaking, useVoiceStream } from "./useVoiceStream";
import { detectVoiceIntent, forSpeech, isBargeIn, isSelfEcho } from "./conversation";

/**
 * The hero screen. Everything on it answers one of five questions:
 * where am I, what is happening, what do I do, what happened, what next.
 */

type Evidence = {
  ref: string;
  sourceType: string;
  label: string;
  excerpt: string;
  occurredAt: string | null;
};

type Proposal = {
  id: string;
  toolName: string;
  summary: string;
  description: string;
  risk: string;
  requiresConfirmation: boolean;
};

type TurnResult = {
  spoken: string;
  recommendation: { text: string; confidence: string } | null;
  question: string | null;
  evidence: Evidence[];
  asset: { id: string; name: string; assetCode: string; siteName: string | null } | null;
  candidates: Array<{ id: string; label: string; assetCode: string }>;
  proposal: Proposal | null;
  meta: {
    path: string;
    model: string | null;
    latencyMs: number;
    costUsd: number;
    budget: { spentSession: number; limitSession: number };
    degraded: boolean;
    creditsCharged: number;
    creditBalance: number | null;
  };
};

type Line = { who: "you" | "fieldpilot"; text: string; at: number };

type Stage = "idle" | "listening" | "thinking" | "ready" | "awaiting" | "executing" | "recorded";

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "idle", label: "Idle" },
  { key: "listening", label: "Listening" },
  { key: "thinking", label: "Retrieving" },
  { key: "ready", label: "Recommended" },
  { key: "awaiting", label: "Approval" },
  { key: "executing", label: "Executing" },
  { key: "recorded", label: "Recorded" },
];

const EXAMPLES = [
  "I'm at Site 14. Pump 3 is vibrating again.",
  "The pressure is 8.7 bar.",
  "Why does this pump keep failing?",
  "Create an urgent work order for the bearing.",
];

export default function VoiceJob({
  firstRun,
  voiceEnabled,
}: {
  firstRun: boolean;
  /** Resolved on the server. False when no speech provider is configured. */
  voiceEnabled: boolean;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [turn, setTurn] = useState<TurnResult | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [receipt, setReceipt] = useState<{ summary: string; minutes: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);

  const startedAt = useRef<number | null>(null);
  const speakingRef = useRef<string | null>(null);
  const lastSpokenRef = useRef<string>("");
  const proposalRef = useRef<Proposal | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "Could not start a session.");
    setSessionId(json.data.sessionId);
    startedAt.current = Date.now();
    return json.data.sessionId as string;
  }, [sessionId]);

  const submitTurn = useCallback(
    async (transcript: string) => {
      const clean = transcript.trim();
      if (!clean || busy) return;

      stopSpeaking(); // barge-in: the technician always wins the floor
      setBusy(true);
      setStage("thinking");
      setNotice(null);
      setLines((l) => [...l, { who: "you", text: clean, at: Date.now() }]);

      try {
        const id = await ensureSession();
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id, transcript: clean }),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          setNotice(json?.error?.message ?? "That didn't go through. Nothing was changed.");
          setStage("ready");
          return;
        }

        const result = json.data as TurnResult;
        setTurn(result);
        setLines((l) => [...l, { who: "fieldpilot", text: result.spoken, at: Date.now() }]);
        say(result.spoken);

        if (result.proposal) {
          setProposal(result.proposal);
          setStage("awaiting");
        } else {
          setProposal(null);
          setStage("ready");
        }
      } catch (error) {
        setNotice((error as Error).message || "Something went wrong. Your work is saved.");
        setStage("ready");
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureSession, muted],
  );

  // Say it aloud, and remember what we said so the microphone picking it back
  // up can be recognised as our own voice rather than answered as a question.
  const say = useCallback(
    (text: string) => {
      lastSpokenRef.current = text;
      if (muted) return;
      const spoken = forSpeech(text);
      speakingRef.current = spoken;
      speak(spoken, () => {
        speakingRef.current = null;
      });
    },
    [muted],
  );

  const voice = useVoiceStream({
    onFinalTurn: (transcript) => {
      // 1. Our own speech, echoed back by the room. Discard it silently —
      //    answering yourself is the fastest way to lose a user's trust.
      if (isSelfEcho(transcript, speakingRef.current, Boolean(speakingRef.current))) return;

      // 2. A short spoken command, resolved on the device. No model call, no
      //    credit, no latency — and it means hands never leave the job.
      const intent = detectVoiceIntent(transcript);
      if (intent.kind === "approve" && proposalRef.current) return void decide("approve");
      if (intent.kind === "reject" && proposalRef.current) return void decide("reject");
      if (intent.kind === "repeat") return say(lastSpokenRef.current);
      if (intent.kind === "stop") {
        stopSpeaking();
        speakingRef.current = null;
        return;
      }

      void submitTurn(transcript);
    },
    // 3. Barge-in. The moment the technician starts speaking, we stop talking.
    onPartial: (partial) => {
      if (speakingRef.current && isBargeIn(partial)) {
        stopSpeaking();
        speakingRef.current = null;
      }
    },
    onError: (message) => setNotice(message),
  });

  useEffect(() => {
    proposalRef.current = proposal;
  }, [proposal]);

  const decide = async (decision: "approve" | "reject") => {
    if (!proposal || busy) return;
    setBusy(true);
    setStage(decision === "approve" ? "executing" : "ready");

    try {
      const res = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId: proposal.id,
          decision,
          problemSummary: lines.find((l) => l.who === "you")?.text ?? "",
          recommendation: turn?.recommendation?.text ?? "",
          evidence: turn?.evidence?.map((e) => ({ ref: e.ref, sourceType: e.sourceType, label: e.label })) ?? [],
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setNotice(json?.error?.message ?? "The action didn't complete. Nothing was changed.");
        setStage("awaiting");
        return;
      }

      if (json.data.rejected) {
        setProposal(null);
        setStage("ready");
        setLines((l) => [...l, { who: "fieldpilot", text: "Dropped that draft. Nothing was recorded.", at: Date.now() }]);
        return;
      }

      setReceipt({ summary: json.data.summary, minutes: json.data.outcome?.minutesReturned ?? 0 });
      setProposal(null);
      setStage("recorded");
      const confirmation = json.data.duplicate
        ? `${json.data.summary} — already recorded, no duplicate created.`
        : `Done. ${json.data.summary}.`;
      setLines((l) => [...l, { who: "fieldpilot", text: confirmation, at: Date.now() }]);
      say(confirmation);
    } catch (error) {
      setNotice((error as Error).message || "The action didn't complete. Nothing was changed.");
      setStage("awaiting");
    } finally {
      setBusy(false);
    }
  };

  const endJob = async () => {
    voice.stop();
    stopSpeaking();
    if (sessionId) await fetch(`/api/sessions?id=${sessionId}`, { method: "DELETE" }).catch(() => {});
    setSessionId(null);
    setStage("idle");
    startedAt.current = null;
  };

  useEffect(() => {
    if (voice.state === "listening" && stage === "idle") setStage("listening");
  }, [voice.state, stage]);

  useEffect(() => {
    const t = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, voice.partial]);

  const live = voiceEnabled && voice.state === "listening";
  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-4">
      {/* --- state rail: the one place the interface is loud ------------------ */}
      <div className="panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Legend>
              {turn?.asset
                ? `${turn.asset.siteName ?? "Site"} · ${turn.asset.name} · ${turn.asset.assetCode}`
                : "No asset identified yet"}
            </Legend>
            <p className={`text-sm font-medium ${live ? "listening" : ""}`}>
              {voiceEnabled ? stageLabel(stage, voice.state) : "Ready — type what you\u2019d say."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="data text-xs text-[var(--muted)]">{formatClock(elapsed)}</span>
            <button className="legend hover:text-[var(--ink)]" onClick={() => setMuted((m) => !m)}>
              {muted ? "Voice off" : "Voice on"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1" role="progressbar" aria-label="Voice job state">
          {STAGES.map((s, i) => (
            <span
              key={s.key}
              className="rail-seg"
              data-on={i <= stageIndex}
              data-live={live && s.key === "listening"}
              title={s.label}
            />
          ))}
        </div>

        {live ? (
          <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--line)]">
            <div
              className="h-full bg-hivis-500 transition-[width] duration-75"
              style={{ width: `${Math.min(100, voice.micLevel * 240)}%` }}
            />
          </div>
        ) : null}
      </div>

      {!voiceEnabled ? (
        <div className="panel border-signal-500 p-3 text-sm">
          <p className="legend">Typing mode</p>
          <p>
            No speech provider is configured on this deployment, so the microphone is switched off.
            Type below instead — it runs the identical pipeline: same asset resolution, same evidence,
            same approval step, same records.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            To enable voice, set ASSEMBLYAI_API_KEY and restart. Run <span className="data">npm run doctor</span> to check.
          </p>
        </div>
      ) : null}

      {notice ? (
        <div className="rise panel border-warn-500 p-3 text-sm text-warn-500">{notice}</div>
      ) : null}

      {/* --- controls -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {!voiceEnabled ? (
          <Button size="lg" disabled title="No speech provider configured">
            Voice unavailable
          </Button>
        ) : live || voice.state === "reconnecting" ? (
          <Button variant="secondary" size="lg" onClick={voice.stop}>Stop listening</Button>
        ) : (
          <Button size="lg" onClick={() => void voice.start()} disabled={busy}>
            {voice.state === "connecting" || voice.state === "requesting-mic" ? "Connecting…" : "Start talking"}
          </Button>
        )}
        {sessionId ? (
          <Button variant="ghost" onClick={() => void endJob()}>End job</Button>
        ) : null}
      </div>

      {/* Typing is a first-class path, not a fallback: plant rooms are loud and
          demos happen on bad wifi. Same pipeline, same guarantees. */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = typed;
          setTyped("");
          void submitTurn(text);
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={voiceEnabled ? "Or type what you'd say…" : "Type what you'd say…"}
          autoFocus={!voiceEnabled}
          className="flex-1 rounded-[4px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm"
        />
        <Button type="submit" variant="secondary" disabled={busy || !typed.trim()}>Send</Button>
      </form>

      {firstRun && lines.length === 0 ? (
        <div className="rise">
          <Legend>Try saying</Legend>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => void submitTurn(example)}
                className="rounded-[4px] border border-[var(--line)] px-2.5 py-1.5 text-left text-xs hover:border-signal-500"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* --- conversation ---------------------------------------------------- */}
      {lines.length > 0 ? (
        <Panel>
          <Legend>This job</Legend>
          <ul className="space-y-3">
            {lines.map((line, i) => (
              <li key={`${line.at}-${i}`} className="rise">
                <span className="legend">{line.who === "you" ? "You" : "FieldPilot"}</span>
                <p className="text-[15px] leading-snug">{line.text}</p>
              </li>
            ))}
            {voice.partial ? (
              <li className="opacity-60">
                <span className="legend">You</span>
                <p className="text-[15px] leading-snug">{voice.partial}…</p>
              </li>
            ) : null}
          </ul>
          <div ref={transcriptEnd} />
        </Panel>
      ) : null}

      {/* --- candidates: never guess between similar assets ------------------ */}
      {turn?.candidates?.length ? (
        <Panel>
          <Legend>Which asset?</Legend>
          <div className="flex flex-wrap gap-2">
            {turn.candidates.map((c) => (
              <Button key={c.id} variant="secondary" onClick={() => void submitTurn(`${c.label} ${c.assetCode}`)}>
                {c.label} <span className="data text-xs text-[var(--muted)]">{c.assetCode}</span>
              </Button>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* --- recommendation + evidence --------------------------------------- */}
      {turn?.recommendation ? (
        <Panel className="rise">
          <div className="flex items-center justify-between">
            <Legend>Recommendation</Legend>
            <Tag tone={turn.recommendation.confidence === "high" ? "ok" : turn.recommendation.confidence === "low" ? "warn" : "neutral"}>
              {turn.recommendation.confidence} confidence
            </Tag>
          </div>
          <p className="text-[15px] leading-snug">{turn.recommendation.text}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            AI-assisted recommendation. Use your own judgement on anything safety-critical.
          </p>
        </Panel>
      ) : null}

      {turn?.evidence?.length ? (
        <Panel>
          <Legend>Why — evidence behind this</Legend>
          <ul className="divide-y divide-[var(--line)]">
            {turn.evidence.map((e) => (
              <li key={e.ref} className="flex gap-3 py-2.5">
                <span className="data mt-0.5 shrink-0 text-[11px] text-signal-500">{e.ref}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">{e.excerpt}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* --- approval: the hard boundary between intelligence and action ----- */}
      {proposal ? (
        <Panel className="rise border-signal-500">
          <Legend>Draft action · your approval required</Legend>
          <p className="text-[15px] font-medium">{proposal.description}</p>
          <p className="data mt-1 text-[11px] text-[var(--muted)]">
            {proposal.toolName} · risk {proposal.risk} · reversible
          </p>
          {voiceEnabled ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Say <strong>&ldquo;yes&rdquo;</strong> to approve or <strong>&ldquo;no&rdquo;</strong> to drop it —
              you don&apos;t need to touch the screen.
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button size="lg" onClick={() => void decide("approve")} disabled={busy}>
              {busy ? "Recording…" : "Approve"}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => void decide("reject")} disabled={busy}>
              Reject
            </Button>
          </div>
        </Panel>
      ) : null}

      {/* --- receipt ---------------------------------------------------------- */}
      {receipt ? (
        <Panel className="rise border-ok-500">
          <Legend>Recorded</Legend>
          <p className="text-[15px] font-medium">{receipt.summary}</p>
          <p className="data mt-1 text-[11px] text-[var(--muted)]">
            Session {formatClock(elapsed)} · about {receipt.minutes} minutes of work returned · audit entry written
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => { setReceipt(null); setTurn(null); setStage(sessionId ? "listening" : "idle"); }}>
              Next issue
            </Button>
            <a href="/work"><Button variant="ghost">See the ledger</Button></a>
          </div>
        </Panel>
      ) : null}

      {/* --- the "AI is not magic" strip: legible cost and provenance --------- */}
      {turn ? (
        <div className="panel px-4 py-2.5">
          <p className="data text-[11px] text-[var(--muted)]">
            path {turn.meta.path}
            {turn.meta.model ? ` · ${turn.meta.model}` : ""} · {turn.meta.latencyMs} ms · ${turn.meta.costUsd.toFixed(5)} this turn · $
            {turn.meta.budget.spentSession.toFixed(4)} of ${turn.meta.budget.limitSession.toFixed(2)} session budget
            {turn.meta.creditsCharged > 0
              ? ` · ${turn.meta.creditsCharged} credit${turn.meta.creditsCharged > 1 ? "s" : ""}`
              : " · free path, no credit spent"}
            {turn.meta.creditBalance !== null ? ` · ${turn.meta.creditBalance} left` : ""}
            {turn.meta.degraded ? " · degraded to the cheaper path" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function stageLabel(stage: Stage, voiceState: string): string {
  if (voiceState === "requesting-mic") return "Asking for the microphone…";
  if (voiceState === "connecting") return "Connecting to voice…";
  if (voiceState === "reconnecting") return "Connection dropped — reconnecting. Your work is saved.";
  switch (stage) {
    case "idle": return "Ready when you are.";
    case "listening": return "Listening — say what you see.";
    case "thinking": return "Checking this asset's history…";
    case "ready": return "Here's what I found.";
    case "awaiting": return "Waiting for your approval.";
    case "executing": return "Recording the action…";
    case "recorded": return "Done and recorded.";
  }
}

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
