import { env } from "./env";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/** Structured logs. PII never enters a log line: identifiers are hashed upstream. */
function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const line = { ts: new Date().toISOString(), level, message, ...fields };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
