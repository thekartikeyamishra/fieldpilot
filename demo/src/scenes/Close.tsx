import React from "react";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";
import { GaugeMark, Legend } from "../components/Primitives";

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", alignItems: "center" }}>
      <Audio src={staticFile("sfx/impact.wav")} volume={0.4} />

      <div style={{ opacity: s, textAlign: "center", transform: `translateY(${(1 - s) * 18}px)` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <GaugeMark size={78} progress={interpolate(frame, [4, 34], [0, 1], { extrapolateRight: "clamp" })} />
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 58, letterSpacing: 10, color: C.paper }}>FIELDPILOT</div>
        <div style={{ fontFamily: F.sans, fontSize: 34, color: C.hivis, marginTop: 20 }}>
          Voice-to-work for field technicians
        </div>

        <div style={{ marginTop: 52, display: "flex", gap: 46, justifyContent: "center" }}>
          {[
            ["Built on", "AssemblyAI"],
            ["Verified", "126 tests"],
            ["Live", "fieldpilot.me"],
          ].map(([k, v]) => (
            <div key={k}>
              <Legend>{k}</Legend>
              <div style={{ fontFamily: F.mono, fontSize: 25, color: C.steelLight, marginTop: 8 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
