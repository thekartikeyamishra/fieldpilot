import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Legend({ children }: { children: ReactNode }) {
  return <p className="legend mb-2">{children}</p>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[4px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3.5 text-base" };
  const variants = {
    primary: "bg-signal-500 text-white hover:bg-signal-600",
    secondary: "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-steel-400",
    ghost: "text-[var(--muted)] hover:text-[var(--ink)]",
    danger: "border border-danger-500 text-danger-500 hover:bg-danger-500 hover:text-white",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "live"; children: ReactNode }) {
  const tones = {
    neutral: "border-[var(--line)] text-[var(--muted)]",
    ok: "border-ok-500 text-ok-500",
    warn: "border-warn-500 text-warn-500",
    danger: "border-danger-500 text-danger-500",
    live: "border-hivis-600 text-hivis-600",
  };
  return (
    <span className={`data inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** An empty screen is an instruction, not a shrug. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <GaugeMark />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--muted)]">{body}</p>
      {action}
    </div>
  );
}

/** House mark: a quarter-sweep gauge. Used for empty states and the wordmark. */
export function GaugeMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="19" stroke="var(--line)" strokeWidth="2" />
      <path d="M24 5a19 19 0 0 1 16.45 9.5" stroke="var(--color-hivis-500)" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 24l9-7" stroke="var(--color-signal-500)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2.5" fill="var(--color-signal-500)" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="legend">{label}</span>
      <input
        {...rest}
        className="mt-1 w-full rounded-[4px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-steel-400"
      />
      {hint ? <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export const priorityTone = (p: string) =>
  p === "urgent" ? "danger" : p === "high" ? "warn" : p === "low" ? "neutral" : "ok";
