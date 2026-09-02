import { env } from "./env";

/**
 * Client IP extraction.
 *
 * `x-forwarded-for` is a list the client can prepend to. Reading the FIRST entry
 * — the common mistake — means an attacker sets it to whatever they like and
 * every IP-based limit becomes trivially evadable, which is worse than having no
 * limit because you believe you are protected.
 *
 * The only trustworthy entries are the ones YOUR proxies appended, counting back
 * from the right. TRUSTED_PROXY_HOPS says how many that is: 1 for Vercel or a
 * single reverse proxy, 2 behind Cloudflare in front of Vercel.
 */
export function clientIp(headers: Headers): string | null {
  // Platform headers are set by infrastructure and cannot be spoofed by a client.
  const platform =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("cf-connecting-ip") ??
    headers.get("true-client-ip");
  if (platform) return normalise(platform);

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return normalise(headers.get("x-real-ip"));

  const chain = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  if (chain.length === 0) return null;

  const hops = Math.max(1, env.TRUSTED_PROXY_HOPS);
  // Count back from the right: entry [length - hops] is the address our own
  // outermost proxy observed. Anything further left was supplied by the client.
  const index = chain.length - hops;
  return normalise(chain[index >= 0 ? index : 0]);
}

function normalise(value: string | null): string | null {
  if (!value) return null;
  let ip = value.trim();
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > 0 ? ip.indexOf("]") : undefined);
  // Strip a trailing port from IPv4 only; IPv6 uses colons legitimately.
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(":")[0];
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return isPlausible(ip) ? ip : null;
}

const isPlausible = (ip: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip.split(".").every((o) => Number(o) <= 255) : /^[0-9a-f:]{3,45}$/i.test(ip);

/** A stable limiter key even when the IP is unknown. */
export const ipKey = (headers: Headers, scope: string): string => `${scope}:ip:${clientIp(headers) ?? "unknown"}`;
