"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/server/auth/actions";
import { Button, Field, GaugeMark } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <GaugeMark size={24} />
        <span className="data text-sm font-semibold tracking-wide">FIELDPILOT</span>
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Pick up where your last job left off.</p>

      <form action={action} className="mt-7 space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {state?.error ? (
          <p className="rounded-[4px] border border-danger-500 px-3 py-2 text-sm text-danger-500">{state.error}</p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-[var(--muted)]">
        New here?{" "}
        <Link href="/signup" className="text-signal-500 underline underline-offset-4">Create an account</Link>
      </p>
    </main>
  );
}
