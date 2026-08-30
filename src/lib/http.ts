import { NextResponse } from "next/server";
import { AppError, isAppError } from "./errors";
import { log } from "./logger";
import { requestId } from "./ids";

export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; requestId: string; retryable: boolean };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

/** Never leaks internals. Always returns a correlation id the user can quote to support. */
export function fail(error: unknown, context: Record<string, unknown> = {}) {
  const rid = requestId();
  const appError = isAppError(error) ? error : new AppError("INTERNAL", String(error));

  log[appError.status >= 500 ? "error" : "warn"]("request_failed", {
    ...context,
    requestId: rid,
    code: appError.code,
    detail: appError.message,
  });

  const body: ApiFailure = {
    ok: false,
    error: {
      code: appError.code,
      message: appError.userMessage,
      requestId: rid,
      retryable: appError.retryable,
    },
  };
  return NextResponse.json(body, { status: appError.status });
}
