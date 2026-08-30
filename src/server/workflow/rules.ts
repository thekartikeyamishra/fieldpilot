import { normaliseSpokenNumbers } from "../context/resolver";

/**
 * Layer 2 of the cost cascade: deterministic intent handling.
 * A large share of field utterances are unambiguous commands. Those cost
 * nothing, answer in milliseconds and cannot hallucinate.
 */
export type RuleMatch =
  | { kind: "measurement"; metric: string; value: number; unit: string }
  | { kind: "create_work_order"; priority: "low" | "normal" | "high" | "urgent" }
  | { kind: "affirmative" }
  | { kind: "negative" }
  | null;

const UNITS: Array<[RegExp, string, string]> = [
  [/(-?\d+(?:\.\d+)?)\s*(?:bar)\b/i, "pressure", "bar"],
  [/(-?\d+(?:\.\d+)?)\s*(?:psi)\b/i, "pressure", "psi"],
  [/(-?\d+(?:\.\d+)?)\s*(?:degrees?|deg|celsius|c)\b/i, "temperature", "C"],
  [/(-?\d+(?:\.\d+)?)\s*(?:rpm)\b/i, "speed", "rpm"],
  [/(-?\d+(?:\.\d+)?)\s*(?:amps?|ampere?s?)\b/i, "current", "A"],
  [/(-?\d+(?:\.\d+)?)\s*(?:mm\/s|millimet(?:re|er)s per second)\b/i, "vibration", "mm/s"],
];

export function matchRule(utterance: string): RuleMatch {
  const text = normaliseSpokenNumbers(utterance.trim().toLowerCase());

  if (/^(yes|yeah|yep|correct|do it|go ahead|confirm|approve|please do)\b/.test(text)) return { kind: "affirmative" };
  if (/^(no|nope|cancel|stop|don'?t|reject)\b/.test(text)) return { kind: "negative" };

  for (const [re, metric, unit] of UNITS) {
    const m = text.match(re);
    if (m && m[1]) {
      const value = Number(m[1]);
      if (Number.isFinite(value)) return { kind: "measurement", metric, value, unit };
    }
  }

  if (/\b(create|open|raise|log|make)\b.{0,20}\b(work order|job card|ticket)\b/.test(text)) {
    const priority = /\b(urgent|emergency|critical|immediately)\b/.test(text)
      ? "urgent"
      : /\bhigh priority\b/.test(text)
        ? "high"
        : /\blow priority\b/.test(text)
          ? "low"
          : "normal";
    return { kind: "create_work_order", priority };
  }

  return null;
}

/** Diagnostic questions need reasoning; commands and readings do not. */
export function needsReasoning(utterance: string): boolean {
  const text = utterance.toLowerCase();
  return (
    /\b(why|what should|what do|how do|keeps?|again|recurring|diagnos|cause|troubleshoot|safe to|should i)\b/.test(text) ||
    text.split(/\s+/).length > 22
  );
}
