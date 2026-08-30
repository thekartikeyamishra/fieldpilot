import { createHash, randomUUID } from "node:crypto";
import { env } from "./env";

export const newId = () => randomUUID();

/** Zero-PII telemetry: identifiers are salted-hashed before they reach any log or metric. */
export const hashId = (value: string) =>
  createHash("sha256").update(`${value}:${env.AUTH_SECRET}`).digest("hex").slice(0, 16);

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Deterministic idempotency key: the same logical intent can never execute twice. */
export const idempotencyKey = (...parts: string[]) => sha256(parts.join("|"));

export const requestId = () => `FP-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
