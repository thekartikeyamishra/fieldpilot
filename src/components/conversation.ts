/**
 * Conversation behaviour that makes voice feel like talking to a colleague
 * rather than operating an IVR.
 *
 * Three problems this solves, all of which show up the first time a real person
 * uses a voice agent:
 *
 *   1. The agent hears itself. The microphone stays open while speech plays, so
 *      its own words come back as a transcript and it answers itself.
 *   2. You cannot interrupt it. Waiting for a machine to finish a sentence you
 *      already understand is the single most irritating thing in voice UX.
 *   3. You cannot say yes. Approving with a thumb defeats the point of a
 *      hands-free product.
 */

/** Rough token overlap. Enough to recognise our own speech coming back. */
export function similarity(a: string, b: string): number {
  const norm = (t: string) =>
    new Set(
      t.toLowerCase().replace(/[^a-z0-9\s\u0900-\u0DFF]/g, " ").split(/\s+/).filter((w) => w.length > 2),
    );
  const first = norm(a);
  const second = norm(b);
  if (first.size === 0 || second.size === 0) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared++;
  return shared / Math.min(first.size, second.size);
}

/**
 * Is this transcript the agent hearing its own speech?
 *
 * Echo cancellation handles most of it, but not a phone on a bench next to a
 * running machine. If what we just said comes back while we are still saying
 * it, discard it — answering your own sentence is the most confidence-
 * destroying thing a voice agent can do.
 */
export function isSelfEcho(transcript: string, spokenText: string | null, isSpeaking: boolean): boolean {
  if (!isSpeaking || !spokenText) return false;
  return similarity(transcript, spokenText) >= 0.6;
}

export type VoiceIntent =
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "repeat" }
  | { kind: "stop" }
  | { kind: "none" };

/**
 * Short spoken commands, resolved on the device with no model call.
 * Free, instant, and available in the languages a technician actually mixes in.
 */
/**
 * Note the `(?!\p{L})` terminator instead of `\b`.
 *
 * JavaScript's word boundary is defined over [A-Za-z0-9_], so every Devanagari,
 * Tamil or Bengali character counts as a non-word character and `\b` silently
 * fails to match after them. A pattern ending in `\b` would have matched every
 * English command and no Indian-language one — the kind of bug that ships
 * quietly in a multilingual product and only shows up in the field.
 */
const PATTERNS: Array<[RegExp, VoiceIntent]> = [
  [/^(?:yes|yeah|yep|yup|ok|okay|correct|right|do it|go ahead|confirm|approve|approved|please do|sure|haan|haa|sari|seri|theek hai|thik hai|ठीक है|हाँ|हां|करो|कर दो|சரி|ಸರಿ|అవును|হ্যাঁ|હા)(?!\p{L})/iu, { kind: "approve" }],
  [/^(?:no|nope|nah|cancel|reject|don'?t|do not|stop that|forget it|nahi|nahin|nako|venda|beda|नहीं|नही|मत|रहने दो|இல்லை|ಬೇಡ|వద్దు|না|ના)(?!\p{L})/iu, { kind: "reject" }],
  [/^(?:repeat|say (?:that )?again|come again|what did you say|pardon|phir se|dobara|फिर से|दोबारा)(?!\p{L})/iu, { kind: "repeat" }],
  [/^(?:stop|quiet|shut up|wait|hold on|ruko|रुको|एक मिनट)(?!\p{L})/iu, { kind: "stop" }],
];

/**
 * Only treated as a command when the whole utterance is one. "Yes, create an
 * urgent work order for the bearing" carries new information and must go to the
 * agent, not be swallowed as a bare approval.
 */
export function detectVoiceIntent(transcript: string): VoiceIntent {
  const text = transcript.trim().replace(/[.!?,]+$/, "");
  // Guard against a command word being buried in a longer, meaningful sentence.
  // Measured in both words and characters, because not every script separates
  // words the way English does.
  if (text.split(/\s+/).filter(Boolean).length > 4 || text.length > 40) return { kind: "none" };
  for (const [pattern, intent] of PATTERNS) if (pattern.test(text)) return intent;
  return { kind: "none" };
}

/**
 * Would this interruption be a real one? A cough or a single stray word picked
 * up mid-sentence should not stop the agent talking; a genuine attempt to speak
 * should stop it instantly.
 */
export function isBargeIn(partial: string): boolean {
  const words = partial.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 || partial.trim().length >= 8;
}

/**
 * Spoken text differs from written text. Screens can show "P-003" and
 * "8.7 bar"; a voice should say "P dash zero zero three" and "eight point seven
 * bar", and should never read a UUID aloud.
 */
export function forSpeech(text: string): string {
  return text
    .replace(/\b([A-Z]{1,3})-(\d{2,4})\b/g, (_m, prefix: string, digits: string) =>
      `${prefix.split("").join(" ")} ${digits.split("").join(" ")}`)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "that record")
    .replace(/\s+/g, " ")
    .trim();
}
