import React from "react";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";
import { GaugeMark } from "../components/Primitives";

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 180, mass: 0.7 } });
  const sweep = interpolate(frame, [6, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", alignItems: "center" }}>
      <Audio src={staticFile("sfx/impact.wav")} volume={0.55} />

      <div style={{ transform: `scale(${0.9 + s * 0.1})`, opacity: s, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
          <GaugeMark size={92} progress={sweep} />
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 74, letterSpacing: 12, color: C.paper }}>FIELDPILOT</div>
        <div style={{ fontFamily: F.sans, fontSize: 33, color: C.hivis, marginTop: 22, letterSpacing: 0.4 }}>
          Talk through the job. It becomes completed work.
        </div>
      </div>
    </AbsoluteFill>
  );
};
