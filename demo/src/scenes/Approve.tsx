import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Panel, Rise } from "../components/Primitives";

const CHECKS = [
  "Authenticated",
  "Correct organisation",
  "Role permits work_order:create",
  "Tool on allowlist",
  "Arguments schema-valid",
  "Within AI trust level",
];

/** The hard boundary between intelligence and action. */
export const Approve: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const approved = frame > 150;
  const pop = spring({ frame: frame - 150, fps, config: { damping: 140, mass: 0.5 } });

  return (
    <AbsoluteFill style={{ background: C.ink, padding: 96 }}>
      <Sequence from={126} durationInFrames={9999}>
        <Audio src={staticFile("sfx/tap.wav")} volume={0.8} />
      </Sequence>
      <Sequence from={152} durationInFrames={9999}>
        <Audio src={staticFile("sfx/confirm.wav")} volume={0.65} />
      </Sequence>

      <Rise>
        <Panel accent={C.signal}>
          <Legend color={C.signal}>Draft action · your approval required</Legend>
          <div style={{ fontFamily: F.sans, fontSize: 38, color: C.paper, marginTop: 14 }}>
            Create an <span style={{ color: C.danger }}>urgent</span> work order: rear-bearing inspection
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 18, color: C.steel, marginTop: 12 }}>
            create_work_order · risk medium · reversible
          </div>

          <div
            style={{
              marginTop: 26,
              display: "flex",
              gap: 16,
              alignItems: "center",
              opacity: interpolate(frame, [110, 128], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <div
              style={{
                background: approved ? C.ok : C.signal,
                color: "#fff",
                fontFamily: F.sans,
                fontSize: 26,
                padding: "16px 40px",
                borderRadius: 5,
                transform: `scale(${1 + (approved ? pop * 0.05 : 0)})`,
              }}
            >
              {approved ? "Approved" : "Approve"}
            </div>
            <div
              style={{
                border: `1px solid ${C.panelLine}`,
                color: C.steelLight,
                fontFamily: F.sans,
                fontSize: 26,
                padding: "16px 34px",
                borderRadius: 5,
              }}
            >
              Reject
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 22, color: C.hivis, marginLeft: 12 }}>
              …or just say &ldquo;yes&rdquo; — hands never leave the job
            </div>
          </div>
        </Panel>
      </Rise>

      <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {CHECKS.map((c, i) => (
          <Rise key={c} delay={22 + i * 13}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ color: C.ok, fontSize: 24 }}>✓</div>
              <div style={{ fontFamily: F.mono, fontSize: 20, color: C.steelLight }}>{c}</div>
            </div>
          </Rise>
        ))}
      </div>

      {approved ? (
        <Rise delay={152} style={{ marginTop: 26 }}>
          <Panel accent={C.ok}>
            <Legend color={C.ok}>Recorded</Legend>
            <div style={{ fontFamily: F.sans, fontSize: 34, color: C.paper, marginTop: 12 }}>
              Work order #14 created as urgent
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 18, color: C.steel, marginTop: 10 }}>
              audit entry written · evidence attached · 14 minutes of work returned
            </div>
          </Panel>
        </Rise>
      ) : null}

      <Caption delay={200}>The model proposed it. A human approved it. The platform executed it.</Caption>
    </AbsoluteFill>
  );
};
