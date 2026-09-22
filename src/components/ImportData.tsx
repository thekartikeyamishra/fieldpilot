"use client";

import { useState } from "react";
import { Button, Legend, Panel, Tag } from "./ui";

type Row = { line: number; key: string; action: "create" | "update" | "error"; message?: string };
type Report = {
  kind: "assets" | "procedures";
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  errors: number;
  sitesCreated: number;
  rows: Row[];
  committed: boolean;
};

const MAX_BYTES = 2_000_000;

/**
 * Two-step import: preview, then commit. Nothing is written until the owner has
 * seen exactly which rows will be created, updated or rejected — and a file with
 * any error cannot be committed at all, so a register is never half-loaded.
 */
export default function ImportData() {
  const [kind, setKind] = useState<"assets" | "procedures">("assets");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setReport(null);
    setNotice(null);
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setNotice("That file is over 2 MB. Split it into smaller imports.");
      return;
    }
    // An .xlsx is a zip archive, not text. Reading it as text produces garbage
    // that fails with a baffling "missing column" error, so catch it up front.
    if (/\.xlsx?$/i.test(file.name)) {
      setNotice("That's an Excel workbook. In Excel choose File → Save As → CSV UTF-8, then upload the .csv.");
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
  };

  const send = async (dryRun: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, csv, dryRun }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setReport(null);
        setNotice(json?.error?.message ?? "The import could not be read. Nothing was changed.");
        return;
      }
      setReport(json.data as Report);
      if (!dryRun && json.data.committed) {
        setNotice(`Done. ${json.data.created} created, ${json.data.updated} updated.`);
      }
    } catch {
      setNotice("Network error. Nothing was changed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const canCommit = report?.dryRun && report.errors === 0 && report.created + report.updated > 0;

  return (
    <div className="space-y-4">
      <Panel>
        <Legend>1 · What are you importing?</Legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["assets", "procedures"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                reset();
              }}
              className="tag"
              style={{
                cursor: "pointer",
                borderColor: kind === k ? "var(--signal)" : undefined,
                color: kind === k ? "var(--signal)" : undefined,
              }}
            >
              {k === "assets" ? "Assets & sites" : "Procedures"}
            </button>
          ))}
          <a href={`/api/import?template=${kind}`} className="ml-auto text-sm underline">
            Download {kind} template
          </a>
        </div>
      </Panel>

      <Panel>
        <Legend>2 · Choose the CSV</Legend>
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-3 block text-sm"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {fileName ? <p className="data mt-2 text-xs text-[var(--muted)]">{fileName}</p> : null}
        <p className="mt-3 text-xs text-[var(--muted)]">
          {kind === "assets"
            ? "Required: site, asset_code, name, type. Optional: status, spec. The asset code is what technicians say out loud — keep it consistent."
            : "Required: reference, asset_type, title, content. Add keywords for how people describe the symptom — that is what gets a procedure matched."}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void send(true)} disabled={!csv || busy}>
            {busy && !report ? "Checking…" : "Preview import"}
          </Button>
          {canCommit ? (
            <Button onClick={() => void send(false)} disabled={busy}>
              {busy ? "Importing…" : `Import ${report!.created + report!.updated} rows`}
            </Button>
          ) : null}
        </div>
      </Panel>

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {report ? (
        <Panel>
          <Legend>{report.committed ? "Imported" : "Preview — nothing written yet"}</Legend>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag>{report.created} new</Tag>
            <Tag>{report.updated} updated</Tag>
            {report.sitesCreated ? <Tag>{report.sitesCreated} new sites</Tag> : null}
            <Tag>{report.errors} errors</Tag>
          </div>
          {report.errors > 0 ? (
            <p className="mt-3 text-sm">
              Fix the rows below and upload again. A file with any error is not imported at all, so your register is
              never left half-loaded.
            </p>
          ) : null}
          <ul className="mt-3 max-h-80 divide-y divide-[var(--line)] overflow-auto">
            {report.rows.map((r) => (
              <li key={`${r.line}-${r.key}`} className="flex gap-3 py-2 text-sm">
                <span className="data w-14 shrink-0 text-xs text-[var(--muted)]">line {r.line}</span>
                <span className="data w-28 shrink-0 text-xs">{r.key}</span>
                <span className={r.action === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                  {r.action === "error" ? r.message : r.action}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
