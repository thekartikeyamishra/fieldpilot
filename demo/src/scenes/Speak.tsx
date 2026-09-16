import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Panel, Rise, StateRail, Typed, Waveform } from "../components/Primitives";

const STAGES = ["Idle", "Listening", "Retrieving", "Recommended", "Approval", "Recorded"];

/** The product, working. Real UI, real state rail, real asset resolution. */
export const Speak: React.FC = () => {
  const frame = useCurrentFrame();
  const active = frame < 40 ? 1 : frame < 150 ? 2 : 3;

  return (
    <AbsoluteFill style={{ background: C.ink, padding: 96 }}>
      <Audio src={staticFile("sfx/roomtone.wav")} volume={0.35} />
      <Audio src={staticFile("sfx/tick.wav")} volume={0.6} startFrom={0} />

      <Panel style={{ padding: 34 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <Legend>Site 14 · Pump 3 · P-003</Legend>
            <div style={{ fontFamily: F.sans, fontSize: 30, color: C.paper, marginTop: 8 }}>
              {active === 1 ? "Listening…" : active === 2 ? "Checking this asset's history…" : "Here's what I found."}
            </div>
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 22, color: C.steel }}>00:14</div>
        </div>
        <StateRail stages={STAGES} active={active} />
      </Panel>

      <div style={{ marginTop: 36, display: "flex", gap: 26, alignItems: "center" }}>
        <Waveform bars={30} amplitude={frame < 70 ? 1 : 0.25} />
        <div style={{ fontFamily: F.mono, fontSize: 17, color: C.steel, letterSpacing: 1.4 }}>
          ASSEMBLYAI · UNIVERSAL STREAMING · 16 kHz PCM
        </div>
      </div>

      <Rise delay={20} style={{ marginTop: 34 }}>
        <Panel>
          <Legend>Transcript</Legend>
          <div style={{ fontFamily: F.sans, fontSize: 34, color: C.paper, marginTop: 14, minHeight: 52 }}>
            <Typed text="I'm at Site 14. Pump three is vibrating again." start={10} cps={20} />
          </div>
        </Panel>
      </Rise>

      <Rise delay={132} style={{ marginTop: 22 }}>
        <Panel accent={C.signal}>
          <Legend color={C.signal}>Asset resolved — no model call needed</Legend>
          <div style={{ display: "flex", gap: 44, marginTop: 16, alignItems: "baseline" }}>
            <div style={{ fontFamily: F.mono, fontSize: 40, color: C.paper }}>P-003</div>
            <div style={{ fontFamily: F.sans, fontSize: 28, color: C.steelLight }}>Pump 3 · centrifugal · Site 14</div>
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 21, color: C.steel, marginTop: 14 }}>
            &ldquo;Pump three&rdquo; became P-003 by deterministic match — free, instant, and it cannot hallucinate.
          </div>
        </Panel>
      </Rise>

      <Caption delay={240}>
        Most of what a technician says never needs a model at all.
      </Caption>
    </AbsoluteFill>
  );
};
