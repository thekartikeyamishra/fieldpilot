/**
 * Everything that did not come from our own policy is untrusted content:
 * transcripts, procedure text, asset descriptions, imported records.
 * It gets fenced and labelled so it stays data and never becomes instruction.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |your |previous |prior )?(instructions|rules|prompt)/i,
  /disregard (the |your )?(above|previous|system)/i,
  /you are now (a|an|the)\b/i,
  /system prompt/i,
  /developer mode/i,
  /\bact as (an? )?(admin|administrator|root)\b/i,
  /grant (me |yourself )?(admin|full|elevated)/i,
  /reveal (your |the )?(prompt|instructions|api key)/i,
];

export type InjectionScan = { suspicious: boolean; matches: string[] };

export function scanForInjection(text: string): InjectionScan {
  const matches: string[] = [];
  for (const re of INJECTION_PATTERNS) if (re.test(text)) matches.push(re.source);
  return { suspicious: matches.length > 0, matches };
}

/** Fence untrusted content. Detection is a signal, not the defence — the real
 *  defence is that this text can only ever reach a schema-validated tool call. */
export function fence(label: string, content: string, maxChars = 1500): string {
  const clipped = content.length > maxChars ? `${content.slice(0, maxChars)}…[truncated]` : content;
  const safe = clipped.replace(/```/g, "'''");
  return `<untrusted source="${label}">\n${safe}\n</untrusted>`;
}

/** Hard input ceiling: oversized transcripts are a cost attack, not a use case. */
export function clampTranscript(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxChars ? collapsed.slice(collapsed.length - maxChars) : collapsed;
}
