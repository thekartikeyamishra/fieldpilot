"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/server/auth/actions";
import { Button, Field, GaugeMark } from "./ui";

const ROLE_LABEL: Record<string, string> = { admin: "an owner", supervisor: "a supervisor", technician: "a technician" };

/**
 * Two modes. A new business creates a workspace; a person with an invite joins
 * an existing one — with no organisation field, because letting them type one
 * is how a technician ends up alone in an empty workspace of their own.
 */
export default function SignupForm({
  invite,
}: {
  invite: { token: string; organizationName: string; role: string; email: string | null } | null;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <GaugeMark size={24} />
        <span className="data text-sm font-semibold tracking-wide">FIELDPILOT</span>
      </Link>

      {invite ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Join {invite.organizationName}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You&apos;ve been invited as {ROLE_LABEL[invite.role] ?? invite.role}. Create your login to get started.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s complete your first job</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Three fields. Your workspace arrives with a site, assets and a procedure so you can talk to it immediately.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Joining your company&apos;s existing workspace? Ask your manager for an invite link instead — signing up here
            creates a separate, empty one.
          </p>
        </>
      )}

      <form action={action} className="mt-7 space-y-4">
        {invite ? <input type="hidden" name="invite" value={invite.token} /> : null}
        <Field label="Your name" name="name" required placeholder="Alex Rivera" autoComplete="name" />
        {invite ? null : <Field label="Organisation" name="organization" required placeholder="Northline Utilities" />}
        <Field
          label="Email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          defaultValue={invite?.email ?? undefined}
          readOnly={Boolean(invite?.email)}
          hint={invite?.email ? "This invite was sent to this address." : undefined}
        />
        <Field label="Password" name="password" type="password" required minLength={8} hint="At least 8 characters" autoComplete="new-password" />
        {state?.error ? (
          <p className="rounded-[4px] border border-danger-500 px-3 py-2 text-sm text-danger-500">{state.error}</p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Setting up…" : invite ? `Join ${invite.organizationName}` : "Create workspace"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-signal-500 underline underline-offset-4">Sign in</Link>
      </p>
    </main>
  );
}
