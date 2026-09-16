import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Panel, Rise } from "../components/Primitives";

const LAYERS = [
  { name: "Voice", detail: "AssemblyAI streaming · turn-taking · barge-in", color: C.hivis },
  { name: "Identity & policy", detail: "tenant isolation · roles · AI trust ladder", color: C.signal },
  { name: "Context graph", detail: "assets · incidents · procedures · outcomes", color: C.signal },
  { name: "Model router", detail: "rules → cache → cheap → reasoning", color: C.signal },
  { name: "Tool gateway", detail: "allowlist · schema · idempotency · approval", color: C.ok },
  { name: "Durable store", detail: "Postgres · audit log · outcome ledger", color: C.steel },
];

/** For the judge asking "is this a wrapper?" — no, and here is the shape of it. */
export const Architecture: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink, padding: 96 }}>
    <Audio src={staticFile("sfx/roomtone.wav")} volume={0.25} />

    <Rise>
      <Legend>Not a voice wrapper — a workflow system with voice as the interface</Legend>
    </Rise>

    <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 11 }}>
      {LAYERS.map((l, i) => (
        <Rise key={l.name} delay={12 + i * 16}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ width: 5, height: 62, background: l.color, borderRadius: 3 }} />
            <Panel style={{ flex: 1, padding: "16px 24px", display: "flex", alignItems: "baseline", gap: 26 }}>
              <div style={{ fontFamily: F.sans, fontSize: 27, color: C.paper, width: 320 }}>{l.name}</div>
              <div style={{ fontFamily: F.mono, fontSize: 19, color: C.steel }}>{l.detail}</div>
            </Panel>
          </div>
        </Rise>
      ))}
    </div>

    <Rise delay={128} style={{ marginTop: 34 }}>
      <div style={{ fontFamily: F.sans, fontSize: 33, color: C.paper, textAlign: "center", lineHeight: 1.4 }}>
        The AI proposes. <span style={{ color: C.signal }}>Policy authorises.</span>{" "}
        <span style={{ color: C.hivis }}>A human approves.</span> <span style={{ color: C.ok }}>Audit records.</span>
      </div>
    </Rise>

    <Caption delay={210}>Seven tools. No execute_sql, no fetch_url, no arbitrary code. Ever.</Caption>
  </AbsoluteFill>
);
