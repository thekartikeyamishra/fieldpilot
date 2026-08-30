import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { Role } from "../policy/roles";

const COOKIE = "fp_session";
const MAX_AGE = 60 * 60 * 8; // 8h - a shift
const key = new TextEncoder().encode(env.AUTH_SECRET);

export type Session = {
  userId: string;
  organizationId: string;
  role: Role;
  name: string;
  email: string;
};

export async function createSessionCookie(session: Session) {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Reads the cookie, then re-checks the user against the database every time:
 *  a revoked or deleted account stops working immediately, not in 8 hours. */
export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, key, { algorithms: ["HS256"] });
    const userId = String(payload.userId ?? "");
    if (!userId) return null;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== "active") return null;

    return {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role as Role,
      name: user.name,
      email: user.email,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHENTICATED");
  return session;
}
