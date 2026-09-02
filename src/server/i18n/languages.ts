/**
 * Language routing.
 *
 * The rule that matters: a technician's language is a property of the person,
 * not the org, and it is preserved for the whole session. We never translate
 * to English to "understand" and translate back — that loses meaning and costs
 * two extra API calls. Native transcript in, native response out.
 */
export type LanguageCode =
  | "en-IN" | "hi-IN" | "bn-IN" | "mr-IN" | "te-IN" | "ta-IN" | "kn-IN" | "gu-IN" | "ml-IN" | "pa-IN";

export type SpeechRoute = "assemblyai" | "sarvam";

export type Language = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  /** Which speech adapter handles this language best. */
  route: SpeechRoute;
  /** Sarvam's own language code, where it differs. */
  sarvamCode: string;
  /** Does the browser's speechSynthesis have a usable voice? Decides if we pay for TTS. */
  browserTts: boolean;
};

export const LANGUAGES: Record<LanguageCode, Language> = {
  "en-IN": { code: "en-IN", label: "English",   nativeLabel: "English",  route: "assemblyai", sarvamCode: "en-IN", browserTts: true },
  "hi-IN": { code: "hi-IN", label: "Hindi",     nativeLabel: "हिन्दी",    route: "sarvam",     sarvamCode: "hi-IN", browserTts: false },
  "bn-IN": { code: "bn-IN", label: "Bengali",   nativeLabel: "বাংলা",    route: "sarvam",     sarvamCode: "bn-IN", browserTts: false },
  "mr-IN": { code: "mr-IN", label: "Marathi",   nativeLabel: "मराठी",    route: "sarvam",     sarvamCode: "mr-IN", browserTts: false },
  "te-IN": { code: "te-IN", label: "Telugu",    nativeLabel: "తెలుగు",   route: "sarvam",     sarvamCode: "te-IN", browserTts: false },
  "ta-IN": { code: "ta-IN", label: "Tamil",     nativeLabel: "தமிழ்",    route: "sarvam",     sarvamCode: "ta-IN", browserTts: false },
  "kn-IN": { code: "kn-IN", label: "Kannada",   nativeLabel: "ಕನ್ನಡ",    route: "sarvam",     sarvamCode: "kn-IN", browserTts: false },
  "gu-IN": { code: "gu-IN", label: "Gujarati",  nativeLabel: "ગુજરાતી",  route: "sarvam",     sarvamCode: "gu-IN", browserTts: false },
  "ml-IN": { code: "ml-IN", label: "Malayalam", nativeLabel: "മലയാളം",   route: "sarvam",     sarvamCode: "ml-IN", browserTts: false },
  "pa-IN": { code: "pa-IN", label: "Punjabi",   nativeLabel: "ਪੰਜਾਬੀ",   route: "sarvam",     sarvamCode: "pa-IN", browserTts: false },
};

export const DEFAULT_LANGUAGE: LanguageCode = "en-IN";

export const isLanguage = (v: string): v is LanguageCode =>
  Object.prototype.hasOwnProperty.call(LANGUAGES, v);

export const languageFor = (v: string | null | undefined): Language =>
  LANGUAGES[isLanguage(v ?? "") ? (v as LanguageCode) : DEFAULT_LANGUAGE];

/**
 * Asset codes, readings and equipment names survive code-switching, because a
 * technician says "pump three" the same way in every language. Digits and Latin
 * tokens are preserved verbatim so the deterministic asset matcher still works
 * on a Hindi transcript: "पंप 3 में vibration आ रहा है" still resolves P-003.
 */
export function extractPortableTokens(transcript: string): string {
  const tokens = transcript.match(/[A-Za-z][A-Za-z0-9-]*|\d+(?:\.\d+)?/g) ?? [];
  return tokens.join(" ");
}

/** Hinglish and its siblings: a Devanagari (or other Indic) block plus Latin script. */
export function isCodeMixed(transcript: string): boolean {
  const indic = /[\u0900-\u0DFF]/.test(transcript);
  const latin = /[A-Za-z]{2,}/.test(transcript);
  return indic && latin;
}
