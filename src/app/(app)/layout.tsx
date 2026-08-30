import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { signOut } from "@/server/auth/actions";
import { GaugeMark } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Today" },
  { href: "/job", label: "Voice job" },
  { href: "/assets", label: "Assets" },
  { href: "/work", label: "Work" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <GaugeMark size={22} />
            <span className="data text-xs font-semibold tracking-wide">FIELDPILOT</span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[4px] px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-steel-50 hover:text-[var(--ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form action={signOut}>
            <button className="legend hover:text-[var(--ink)]" title={session.email}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
