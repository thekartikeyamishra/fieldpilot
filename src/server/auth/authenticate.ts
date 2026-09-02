import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { verifyPassword } from "./password";
import type { Session } from "./session";
import type { Role } from "../policy/roles";

/**
 * One authentication path, shared by the sign-in form and the login endpoint.
 * Two entry points must never mean two sets of rules.
 */
export async function authenticate(emailRaw: string, password: string): Promise<Session | null> {
  const email = emailRaw.toLowerCase().trim();

  try {
    await rateLimit(`signin:${email}`, 10, 300);
  } catch {
    throw new AppError("RATE_LIMITED", "too many sign-in attempts");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Same outcome and similar timing whether the account exists or not, so the
  // response cannot be used to enumerate registered emails.
  if (!user) {
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA");
    return null;
  }
  if (user.status !== "active") return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role as Role,
    name: user.name,
    email: user.email,
  };
}
