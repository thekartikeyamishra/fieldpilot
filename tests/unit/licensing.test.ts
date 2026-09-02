import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isReadOnly, seatStatus, verifyLicence, type Licence } from "@/server/licensing/license";

const SECRET = "test-signing-secret";

function sign(licence: Licence, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(licence)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

const licence = (over: Partial<Licence> = {}): Licence => ({
  tier: "self-hosted",
  licensee: "Northline Utilities",
  seats: 25,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 200 * 86_400_000).toISOString(),
  ...over,
});

describe("licence verification", () => {
  it("accepts a correctly signed licence", () => {
    const status = verifyLicence(sign(licence()), SECRET);
    expect(status.state).toBe("valid");
    expect(isReadOnly(status)).toBe(false);
  });

  it("rejects a licence signed with the wrong key", () => {
    const status = verifyLicence(sign(licence(), "not-the-secret"), SECRET);
    expect(status.state).toBe("invalid");
    expect(isReadOnly(status)).toBe(true);
  });

  it("rejects a payload edited after signing", () => {
    const forged = Buffer.from(JSON.stringify(licence({ seats: 100000 }))).toString("base64url");
    const original = sign(licence()).split(".")[1];
    expect(verifyLicence(`${forged}.${original}`, SECRET).state).toBe("invalid");
  });

  it("rejects a missing or malformed key without crashing", () => {
    expect(verifyLicence(undefined, SECRET).state).toBe("missing");
    expect(verifyLicence("garbage", SECRET).state).toBe("invalid");
    expect(verifyLicence("a.b", SECRET).state).toBe("invalid");
  });

  it("warns before it expires rather than surprising the operator", () => {
    const status = verifyLicence(sign(licence({ expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString() })), SECRET);
    expect(status.state).toBe("expiring");
    expect(isReadOnly(status)).toBe(false);
  });

  it("degrades an expired licence to read-only, never destructive", () => {
    const status = verifyLicence(sign(licence({ expiresAt: new Date(Date.now() - 86_400_000).toISOString() })), SECRET);
    expect(status.state).toBe("expired");
    expect(isReadOnly(status)).toBe(true);
    if (status.state === "expired") expect(status.message).toContain("records remain intact");
  });

  it("does not accept a licence with an unparseable expiry", () => {
    expect(verifyLicence(sign(licence({ expiresAt: "whenever" })), SECRET).state).toBe("invalid");
  });
});

describe("seat enforcement", () => {
  it("warns over the limit but never blocks a technician mid-shift", () => {
    const over = seatStatus(licence({ seats: 5 }), 9);
    expect(over.withinLimit).toBe(false);
    expect(over.message).toContain("licensed for 5");
  });

  it("treats zero seats as unlimited", () => {
    expect(seatStatus(licence({ seats: 0 }), 10_000).withinLimit).toBe(true);
  });
});
