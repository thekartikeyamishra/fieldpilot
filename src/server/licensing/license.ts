import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Licence verification for self-hosted and OEM deployments.
 *
 * Design stance, stated because it is a deliberate commercial choice:
 * this makes paying easier than not paying; it does not punish a customer
 * whose renewal is late. An expired licence degrades to read-only and warns
 * loudly. It never deletes data, never locks someone out of their own records,
 * and never interrupts a shift in progress.
 *
 * The hosted service does not use this at all — the terms of service cover it.
 */

export type LicenceTier = "hosted" | "self-hosted" | "oem" | "enterprise";

export type Licence = {
  tier: LicenceTier;
  licensee: string;
  /** Maximum technicians this deployment is licensed for. 0 = unlimited. */
  seats: number;
  issuedAt: string;
  expiresAt: string;
};

export type LicenceStatus =
  | { state: "hosted"; message: string }
  | { state: "valid"; licence: Licence; daysRemaining: number }
  | { state: "expiring"; licence: Licence; daysRemaining: number; message: string }
  | { state: "expired"; licence: Licence; message: string; readOnly: true }
  | { state: "invalid"; message: string; readOnly: true }
  | { state: "missing"; message: string; readOnly: true };

/**
 * Format: base64url(JSON payload) + "." + hex HMAC-SHA256 over that payload.
 * Signed offline with the Owner's key; verification needs only the public
 * verification secret, and never contacts a server.
 */
export function verifyLicence(key: string | undefined, signingSecret: string): LicenceStatus {
  if (!key) {
    return {
      state: "missing",
      message:
        "No licence key configured. Self-hosted deployments require one — contact workmailkartikeya@gmail.com.",
      readOnly: true,
    };
  }

  const [payload, signature] = key.split(".");
  if (!payload || !signature) return { state: "invalid", message: "Licence key is malformed.", readOnly: true };

  const expected = createHmac("sha256", signingSecret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { state: "invalid", message: "Licence signature does not verify.", readOnly: true };
  }

  let licence: Licence;
  try {
    licence = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Licence;
  } catch {
    return { state: "invalid", message: "Licence payload is unreadable.", readOnly: true };
  }

  const expiry = new Date(licence.expiresAt).getTime();
  if (Number.isNaN(expiry)) return { state: "invalid", message: "Licence has no valid expiry.", readOnly: true };

  const daysRemaining = Math.floor((expiry - Date.now()) / 86_400_000);

  if (daysRemaining < 0) {
    return {
      state: "expired",
      licence,
      readOnly: true,
      message:
        "Licence expired. FieldPilot is read-only: your records remain intact and exportable. Renew to resume writing.",
    };
  }

  if (daysRemaining <= 30) {
    return {
      state: "expiring",
      licence,
      daysRemaining,
      message: `Licence expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
    };
  }

  return { state: "valid", licence, daysRemaining };
}

/** Seat enforcement warns rather than blocks: a technician mid-shift is never locked out. */
export function seatStatus(licence: Licence, activeTechnicians: number) {
  const withinLimit = licence.seats === 0 || activeTechnicians <= licence.seats;
  return {
    withinLimit,
    seats: licence.seats,
    activeTechnicians,
    message: withinLimit
      ? null
      : `This deployment is licensed for ${licence.seats} technicians and has ${activeTechnicians} active. Contact us to extend it.`,
  };
}

/** The hosted product is governed by the terms of service, not a key. */
export function licenceStatus(): LicenceStatus {
  if (env.DEPLOYMENT_MODE === "hosted") {
    return { state: "hosted", message: "Hosted deployment — governed by the terms of service." };
  }
  return verifyLicence(env.LICENSE_KEY, env.LICENSE_SIGNING_SECRET);
}

export const isReadOnly = (status: LicenceStatus): boolean => "readOnly" in status && status.readOnly === true;
