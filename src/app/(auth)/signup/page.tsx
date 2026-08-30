"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/server/auth/actions";
import { Button, Field, GaugeMark } from "@/components/ui";

/** Three fields, then straight into a real job. No questionnaire, no tour. */
export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <GaugeMark size={24} />
        <span className="data text-sm font-semibold tracking-wide">FIELDPILOT</span>
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s complete your first job</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Three fields. Your workspace arrives with a site, assets and a procedure so you can talk to it immediately.
      </p>

      <form action={action} className="mt-7 space-y-4">
        <Field label="Your name" name="name" required placeholder="Alex Rivera" autoComplete="name" />
        <Field label="Organisation" name="organization" required placeholder="Northline Utilities" />
        <Field label="Email" name="email" type="email" required placeholder="you@company.com" autoComplete="email" />
        <Field label="Password" name="password" type="password" required minLength={8} hint="At least 8 characters" autoComplete="new-password" />
        {state?.error ? (
          <p className="rounded-[4px] border border-danger-500 px-3 py-2 text-sm text-danger-500">{state.error}</p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Setting up…" : "Create workspace"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="text-signal-500 underline underline-offset-4">Sign in</Link>
      </p>
    </main>
  );
}
