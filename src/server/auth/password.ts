import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain.normalize("NFKC"), salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

/** Constant-time compare; malformed hashes fail closed rather than throwing. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "base64url");
  const actual = await scryptAsync(plain.normalize("NFKC"), Buffer.from(salt, "base64url"), KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
