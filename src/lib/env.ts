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
