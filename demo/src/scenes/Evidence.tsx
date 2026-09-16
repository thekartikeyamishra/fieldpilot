import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Panel, Rise } from "../components/Primitives";

const EVIDENCE = [
  { ref: "E1", label: "Incident — vibration during start-up", meta: "63 days ago · resolved · medium" },
  { ref: "E2", label: "Incident — vibration with elevated pressure", meta: "24 days ago · resolved · high" },
  { ref: "E3", label: "Measurement — pressure 8.6 bar", meta: "24 days ago · above recorded range" },
  { ref: "E4", label: "Procedure MP-17 v3 — bearing inspection", meta: "matched on asset type + symptom" },
];

/**
 * The differentiator, made visible. Not "the AI says" but "here is the record,
 * with its date, that this conclusion rests on".
 */
export const Evidence: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink, padding: 96 }}>
    <Audio src={staticFile("sfx/roomtone.wav")} volume={0.3} />

    <Rise>
      <Legend>Why — the evidence behind the recommendation</Legend>
    </Rise>

    <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14 }}>
      {EVIDENCE.map((e, i) => (
        <React.Fragment key={e.ref}>
          <Sequence from={14 + i * 22} durationInFrames={9999}>
            <Audio src={staticFile("sfx/tick.wav")} volume={0.5} />
          </Sequence>
          <Rise delay={14 + i * 22}>
            <Panel style={{ padding: 22, display: "flex", gap: 26, alignItems: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 26, color: C.signal, width: 54 }}>{e.ref}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.sans, fontSize: 27, color: C.paper }}>{e.label}</div>
                <div style={{ fontFamily: F.mono, fontSize: 17, color: C.steel, marginTop: 6 }}>{e.meta}</div>
              </div>
            </Panel>
          </Rise>
        </React.Fragment>
      ))}
    </div>

    <Rise delay={122} style={{ marginTop: 30 }}>
      <Panel accent={C.hivis}>
        <Legend color={C.hivis}>Recommendation · medium confidence</Legend>
        <div style={{ fontFamily: F.sans, fontSize: 35, color: C.paper, marginTop: 14, lineHeight: 1.35 }}>
          Inspect the rear bearing assembly before restarting. Two vibration incidents in 90 days — MP-17 says
          escalate to a supervisor.
        </div>
      </Panel>
    </Rise>

    <Caption delay={200}>
      Evidence references are issued by the server. The model can cite them — it cannot invent one.
    </Caption>
  </AbsoluteFill>
);
