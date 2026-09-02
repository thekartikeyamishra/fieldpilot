import { z } from "zod";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { authenticate } from "@/server/auth/authenticate";
import { createSessionCookie } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/audit";
import { rateLimit } from "@/lib/rate-limit";
import { ipKey } from "@/lib/client-ip";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

/** Programmatic sign-in for CI, smoke tests and non-browser clients. */
export async function POST(request: Request) {
  try {
    // Per-email limiting alone is evaded by rotating the email. Both apply.
    await rateLimit(ipKey(request.headers, "signin"), env.RATE_LIMIT_AUTH_PER_IP, 300);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "email and password required");

    const session = await authenticate(parsed.data.email, parsed.data.password);
    if (!session) throw new AppError("UNAUTHENTICATED", "invalid credentials");

    await createSessionCookie(session);
    await recordAudit({
      organizationId: session.organizationId,
      actorType: "user",
      actorId: session.userId,
      action: "auth.signin",
      resourceType: "user",
      resourceId: session.userId,
      result: "succeeded",
    });

    return ok({ userId: session.userId, name: session.name, role: session.role });
  } catch (error) {
    return fail(error, { route: "auth/login" });
  }
}
