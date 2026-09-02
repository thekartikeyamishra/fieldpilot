import { describe, expect, it } from "vitest";
import { clientIp, ipKey } from "@/lib/client-ip";

const h = (headers: Record<string, string>) => new Headers(headers);

describe("client IP extraction", () => {
  it("takes the address our own proxy observed, not the one the client claimed", () => {
    // The attack: prepend a fake address so per-IP limits track a fiction.
    // With one trusted hop the real client is the last entry, not the first.
    const headers = h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("cannot be fooled by a long spoofed chain", () => {
    const spoofed = Array.from({ length: 50 }, (_, i) => `10.0.0.${i}`).join(", ");
    const headers = h({ "x-forwarded-for": `${spoofed}, 198.51.100.7` });
    expect(clientIp(headers)).toBe("198.51.100.7");
  });

  it("prefers platform headers, which a client cannot set", () => {
    const headers = h({ "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "198.51.100.1" });
    expect(clientIp(headers)).toBe("198.51.100.1");
  });

  it("strips an IPv4 port but leaves IPv6 intact", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.5:51234" }))).toBe("203.0.113.5");
    expect(clientIp(h({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(clientIp(h({ "x-real-ip": "::ffff:203.0.113.8" }))).toBe("203.0.113.8");
  });

  it("rejects junk rather than keying a limiter on it", () => {
    expect(clientIp(h({ "x-real-ip": "not-an-ip" }))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "999.999.999.999" }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });

  it("still produces a usable limiter key when the IP is unknown", () => {
    // Unknown must bucket together, not vanish — otherwise the limit disappears.
    expect(ipKey(h({}), "signin")).toBe("signin:ip:unknown");
  });

  it("gives different keys to different clients", () => {
    expect(ipKey(h({ "cf-connecting-ip": "1.1.1.1" }), "signin")).not.toBe(
      ipKey(h({ "cf-connecting-ip": "2.2.2.2" }), "signin"),
    );
  });
});
