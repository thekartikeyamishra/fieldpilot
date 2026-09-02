import { fail, ok } from "@/lib/http";
import { destroySession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await destroySession();
    return ok({ signedOut: true });
  } catch (error) {
    return fail(error, { route: "auth/logout" });
  }
}
