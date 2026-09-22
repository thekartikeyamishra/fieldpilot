import { describe, expect, it } from "vitest";
import { hashToken, INVITABLE_ROLES, INVITE_TTL_DAYS, newToken } from "@/server/team/invites";

describe("invite tokens", () => {
  it("are long enough that guessing one is not a strategy", () => {
    // 32 random bytes → 43 base64url characters, 256 bits of entropy.
    expect(newToken().length).toBeGreaterThanOrEqual(43);
  });

  it("are unique across many generations", () => {
    const tokens = new Set(Array.from({ length: 5000 }, newToken));
    expect(tokens.size).toBe(5000);
  });

  it("are stored only as a hash — the database never holds a working link", () => {
    const token = newToken();
    const hashed = hashToken(token);
    expect(hashed).not.toContain(token);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash deterministically, so a link can be looked up", () => {
    const token = newToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("are URL-safe, so they survive WhatsApp and email clients", () => {
    for (let i = 0; i < 200; i++) expect(newToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("invite policy", () => {
  it("expires within a week", () => {
    expect(INVITE_TTL_DAYS).toBeLessThanOrEqual(7);
  });

  it("only offers roles that exist", () => {
    expect(INVITABLE_ROLES.sort()).toEqual(["admin", "supervisor", "technician"]);
  });
});
