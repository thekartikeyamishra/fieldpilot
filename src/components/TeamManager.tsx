"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Legend, Panel, Tag } from "./ui";

type Member = { id: string; name: string; email: string; role: string; status: string };
type Pending = { id: string; role: string; email: string | null; expiresAt: string };

const ROLES = [
  { value: "technician", label: "Technician", help: "Uses voice jobs, logs readings, raises work orders" },
  { value: "supervisor", label: "Supervisor", help: "Also closes work orders, imports data, reviews audit" },
  { value: "admin", label: "Owner", help: "Everything, including billing and the team" },
];

export default function TeamManager({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [role, setRole] = useState("technician");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    const json = await res.json();
    if (json.ok) {
      setMembers(json.data.members);
      setPending(json.data.pending);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (method: string, url: string, body?: unknown) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) {
        setNotice(json?.error?.message ?? "That didn't work. Nothing was changed.");
        return null;
      }
      await load();
      return json.data;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setLink(null);
    const data = await call("POST", "/api/team", { role, email });
    if (data) {
      setLink(data.link);
      setEmail("");
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <Legend>Invite someone</Legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className="panel p-3 text-left"
              style={{ borderColor: role === r.value ? "var(--signal)" : undefined }}
            >
              <p className="text-sm font-medium">{r.label}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{r.help}</p>
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          Their email <span className="text-[var(--muted)]">(optional — pins the link to that address)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="technician@company.com"
            className="mt-1 w-full rounded-[4px] border border-[var(--line)] bg-transparent px-3 py-2"
          />
        </label>
        <Button className="mt-4" onClick={() => void invite()} disabled={busy}>
          Create invite link
        </Button>

        {link ? (
          <div className="mt-4">
            <p className="text-sm">
              Send this link to them — by WhatsApp, email, however you normally reach them. It works once and expires in 7
              days. <strong>It is shown only now.</strong>
            </p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={link} className="data w-full rounded-[4px] border border-[var(--line)] bg-transparent px-2 py-2 text-xs" />
              <Button onClick={() => void navigator.clipboard?.writeText(link).then(() => setNotice("Link copied."))}>Copy</Button>
            </div>
          </div>
        ) : null}
      </Panel>

      {notice ? <p role="status" className="text-sm">{notice}</p> : null}

      <Panel>
        <Legend>Team · {members.filter((m) => m.status === "active").length} active</Legend>
        <ul className="mt-2 divide-y divide-[var(--line)]">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.name} {m.id === currentUserId ? <span className="text-[var(--muted)]">(you)</span> : null}
                </p>
                <p className="data text-xs text-[var(--muted)]">{m.email}</p>
              </div>
              {m.status !== "active" ? <Tag>deactivated</Tag> : null}
              <select
                value={m.role}
                disabled={busy || m.id === currentUserId}
                onChange={(e) => void call("PATCH", "/api/team", { memberId: m.id, role: e.target.value })}
                className="rounded-[4px] border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {m.id !== currentUserId ? (
                <Button
                  onClick={() =>
                    void call("PATCH", "/api/team", {
                      memberId: m.id,
                      status: m.status === "active" ? "deactivated" : "active",
                    })
                  }
                  disabled={busy}
                >
                  {m.status === "active" ? "Deactivate" : "Reactivate"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Deactivating someone signs them out on their next action and keeps every record they created — the audit trail
          is never rewritten.
        </p>
      </Panel>

      {pending.length ? (
        <Panel>
          <Legend>Pending invites</Legend>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  {p.email ?? "Anyone with the link"} · {p.role}
                  <span className="data ml-2 text-xs text-[var(--muted)]">
                    expires {new Date(p.expiresAt).toLocaleDateString()}
                  </span>
                </span>
                <Button onClick={() => void call("DELETE", `/api/team?invite=${p.id}`)} disabled={busy}>Revoke</Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
