import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Rise } from "../components/Primitives";

const STEPS = [
  "Stop work",
  "Walk to a terminal",
  "Find the asset",
  "Read its history",
  "Locate the procedure",
  "Type the record",
];

/**
 * The cost, shown rather than asserted: six steps stacking up, a clock running,
 * and the punchline that the decision itself took seconds.
 */
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const minutes = Math.min(15, Math.floor(interpolate(frame, [20, 190], [0, 15], { extrapolateRight: "clamp" })));

  return (
    <AbsoluteFill style={{ background: C.ink, padding: 110, justifyContent: "center" }}>
      <Rise>
        <Legend>What happens next today</Legend>
      </Rise>

      <div style={{ display: "flex", gap: 14, marginTop: 40, flexWrap: "wrap" }}>
        {STEPS.map((step, i) => (
          <Rise key={step} delay={18 + i * 16}>
            <div
              style={{
                fontFamily: F.sans,
                fontSize: 27,
                color: C.steelLight,
                border: `1px solid ${C.panelLine}`,
                background: C.panel,
                borderRadius: 5,
                padding: "16px 24px",
              }}
            >
              {step}
            </div>
          </Rise>
        ))}
      </div>

      <div style={{ marginTop: 66, display: "flex", alignItems: "baseline", gap: 24 }}>
        <div style={{ fontFamily: F.mono, fontSize: 132, color: C.warn, fontVariantNumeric: "tabular-nums" }}>
          {String(minutes).padStart(2, "0")}:00
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 30, color: C.steel }}>before anything is written down</div>
      </div>

      <Rise delay={200} style={{ marginTop: 44 }}>
        <div style={{ fontFamily: F.sans, fontSize: 34, color: C.paper, maxWidth: 1180, lineHeight: 1.4 }}>
          So it gets written later, from memory. Or not at all. And the history that should inform the{" "}
          <span style={{ color: C.hivis }}>next</span> breakdown quietly disappears.
        </div>
      </Rise>

      <Caption delay={310}>The software isn&apos;t bad. Using it means stopping work.</Caption>
    </AbsoluteFill>
  );
};
