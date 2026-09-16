import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Typed, Waveform } from "../components/Primitives";

/**
 * Cold open. No logo, no music sting, no "introducing".
 * A technician says a sentence, and the viewer is already inside the problem.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(frame, [0, 30, 150], [0, 0.35, 0.2], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.ink, justifyContent: "center", alignItems: "center" }}>
      <Audio src={staticFile("sfx/roomtone.wav")} volume={0.5} />

      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.hivis}22 0%, transparent 62%)`,
          opacity: glow,
        }}
      />

      <div style={{ opacity: interpolate(frame, [8, 24], [0, 1], { extrapolateRight: "clamp" }) }}>
        <Waveform bars={56} amplitude={interpolate(frame, [20, 70], [0.35, 1.15], { extrapolateRight: "clamp" })} />
      </div>

      <div
        style={{
          fontFamily: F.sans,
          fontSize: 54,
          color: C.paper,
          marginTop: 56,
          maxWidth: 1100,
          textAlign: "center",
          lineHeight: 1.28,
          minHeight: 150,
        }}
      >
        <Typed text="&ldquo;I'm at Site 14. Pump three is vibrating again.&rdquo;" start={26} cps={26} />
      </div>

      <Caption delay={140}>A technician, hands busy, standing in front of the machine.</Caption>
    </AbsoluteFill>
  );
};
