import { z } from "zod";

/**
 * Single source of truth for configuration. Fails fast and loudly at boot
 * instead of producing mysterious runtime errors halfway through a demo.
 */
const bool = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? d : v.toLowerCase() === "true"));

const num = (d: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : Number(v)))
    .pipe(z.number().finite());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  ASSEMBLYAI_API_KEY: z.string().default(""),
  ASSEMBLYAI_STREAMING_HOST: z.string().default("streaming.assemblyai.com"),
  ASSEMBLYAI_SPEECH_MODEL: z.string().default("u3-rt-pro"),
  ASSEMBLYAI_TOKEN_TTL_SECONDS: num(60),

  AI_BASE_URL: z.string().default("https://llm-gateway.assemblyai.com/v1"),
  AI_API_KEY: z.string().default(""),
  AI_MODEL_FAST: z.string().default("gpt-4o-mini"),
  AI_MODEL_SMART: z.string().default("claude-sonnet-4.6"),
  AI_FALLBACK_BASE_URL: z.string().default(""),
  AI_FALLBACK_API_KEY: z.string().default(""),
  AI_FALLBACK_MODEL: z.string().default(""),

  AI_COST_LIMIT_PER_SESSION: num(0.15),
  AI_COST_LIMIT_PER_USER_DAY: num(1.0),
  AI_COST_LIMIT_PER_ORG_MONTH: num(25.0),
  VOICE_SESSION_MAX_SECONDS: num(600),
  VOICE_MAX_MODEL_CALLS_PER_SESSION: num(25),
  VOICE_MAX_TOOL_CALLS_PER_SESSION: num(12),
  MAX_TRANSCRIPT_CHARS: num(1200),

  CREDITS_FREE_PER_MONTH: num(25),
  CREDITS_PRO_PER_MONTH: num(600),
  CREDIT_PRICE_USD: num(0.0136),
  CREDITS_PER_REASONING_TURN: num(2),
  CREDITS_PER_FAST_TURN: num(1),

  // --- Licensing: hosted needs no key; self-hosted does --------------------
  DEPLOYMENT_MODE: z.enum(["hosted", "self-hosted"]).default("hosted"),
  LICENSE_KEY: z.string().default(""),
  LICENSE_SIGNING_SECRET: z.string().default("fieldpilot-dev-verification-secret"),

  // --- Sarvam: Indian-language speech and inference -----------------------
  SARVAM_API_KEY: z.string().default(""),
  SARVAM_STT_MODEL: z.string().default("saaras:v4"),
  SARVAM_TTS_MODEL: z.string().default("bulbul:v3"),
  SARVAM_TTS_SPEAKER: z.string().default("anushka"),
  SARVAM_LLM_BASE_URL: z.string().default("https://api.sarvam.ai/v1"),
  SARVAM_LLM_MODEL: z.string().default("sarvam-105b"),
  /** Pay for speech output only where the browser has no usable voice. */
  SARVAM_TTS_ENABLED: bool(true),

  // razorpay | mock. "mock" fulfils instantly and is for local development only.
  /** Domestic (INR) provider. */
  PAYMENTS_PROVIDER: z.enum(["razorpay", "mock"]).default("mock"),
  /** Cross-border provider. Square settles USD and most major currencies. */
  PAYMENTS_PROVIDER_INTL: z.enum(["square", "none"]).default("none"),
  PAYMENTS_CURRENCY_INTL: z.string().default("USD"),
  PAYMENTS_CURRENCY: z.string().default("INR"),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  // --- Square (international) ---------------------------------------------
  SQUARE_ACCESS_TOKEN: z.string().default(""),
  SQUARE_LOCATION_ID: z.string().default(""),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().default(""),
  /**
   * The webhook URL EXACTLY as entered in the Square dashboard. Square signs
   * (url + body), so a trailing slash or http/https mismatch here makes every
   * signature fail — and the failure looks identical to a forged request.
   */
  SQUARE_WEBHOOK_URL: z.string().default(""),
  SQUARE_ENVIRONMENT: z.enum(["production", "sandbox"]).default("production"),

  /** Proxies in front of the app that append to x-forwarded-for. Vercel = 1. */
  TRUSTED_PROXY_HOPS: num(1),
  RATE_LIMIT_AUTH_PER_IP: num(30),

  RATE_LIMIT_REQUESTS: num(60),
  RATE_LIMIT_WINDOW_SECONDS: num(60),

  FEATURE_VOICE_AGENT: bool(true),
  FEATURE_TOOL_EXECUTION: bool(true),
  FEATURE_OUTCOME_LEDGER: bool(true),
  FEATURE_DEMO_MODE: bool(true),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill it in.`);
}

export const env = parsed.data;
export type Env = typeof env;

/** The LLM key falls back to the AssemblyAI key: the Gateway accepts it directly. */
export const aiApiKey = () => env.AI_API_KEY || env.ASSEMBLYAI_API_KEY;
