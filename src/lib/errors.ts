/**
 * Three-layer error model (TAD §34):
 *   internal  -> code + severity + retryable, goes to logs
 *   api       -> safe payload, no internals
 *   ui        -> human sentence that always says what is safe
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "BUDGET_EXCEEDED"
  | "SESSION_LIMIT_REACHED"
  | "PROVIDER_UNAVAILABLE"
  | "TOOL_NOT_ALLOWED"
  | "TOOL_FAILED"
  | "CONFLICT"
  | "FEATURE_DISABLED"
  | "INTERNAL";

const HTTP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  SESSION_LIMIT_REACHED: 409,
  PROVIDER_UNAVAILABLE: 503,
  TOOL_NOT_ALLOWED: 403,
  TOOL_FAILED: 500,
  CONFLICT: 409,
  FEATURE_DISABLED: 503,
  INTERNAL: 500,
};

/** What the user actually reads. Every message states what is safe. */
const HUMAN: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again — nothing was lost.",
  FORBIDDEN: "You don't have permission to do that on this asset.",
  NOT_FOUND: "That record isn't available in your organisation.",
  VALIDATION_FAILED: "That request didn't look right, so nothing was changed.",
  RATE_LIMITED: "Too many requests in a row. Wait a moment and try again.",
  BUDGET_EXCEEDED: "You've reached your current usage allowance. Your work is saved.",
  SESSION_LIMIT_REACHED: "This voice session reached its limit. Start a new one — everything so far is recorded.",
  PROVIDER_UNAVAILABLE: "Voice is temporarily unavailable. Your work is safe. Try again.",
  TOOL_NOT_ALLOWED: "That action isn't permitted from a voice session.",
  TOOL_FAILED: "The action didn't complete. Nothing was changed. Try again.",
  CONFLICT: "That action was already completed. No duplicate was created.",
  FEATURE_DISABLED: "That capability is switched off right now. Your work is saved.",
  INTERNAL: "Something went wrong on our side. Your work is safe. Try again.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message?: string, detail?: unknown) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = HTTP[code];
    this.retryable = code === "PROVIDER_UNAVAILABLE" || code === "RATE_LIMITED" || code === "INTERNAL";
    this.detail = detail;
  }

  get userMessage(): string {
    return HUMAN[this.code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
export const humanMessage = (code: ErrorCode) => HUMAN[code];
