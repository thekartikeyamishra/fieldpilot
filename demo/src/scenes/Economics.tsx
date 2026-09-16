import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { Caption, Legend, Panel, Rise } from "../components/Primitives";

const Figure: React.FC<{ label: string; value: string; sub: string; delay: number; color?: string }> = ({
  label,
  value,
  sub,
  delay,
  color = C.paper,
}) => (
  <Rise delay={delay} style={{ flex: 1 }}>
    <Panel style={{ padding: 26 }}>
      <Legend>{label}</Legend>
      <div style={{ fontFamily: F.mono, fontSize: 52, color, marginTop: 12 }}>{value}</div>
      <div style={{ fontFamily: F.mono, fontSize: 17, color: C.steel, marginTop: 8 }}>{sub}</div>
    </Panel>
  </Rise>
);

/** Most demos stop at "it works". This is the part a business actually buys. */
export const Economics: React.FC = () => {
  const frame = useCurrentFrame();
  const cost = interpolate(frame, [10, 60], [0, 0.26], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.ink, padding: 96, justifyContent: "center" }}>
      <Rise>
        <Legend>Every turn priced, before it is spent</Legend>
      </Rise>

      <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
        <Figure label="Cost per turn" value={`₹${cost.toFixed(2)}`} sub="English · AssemblyAI + cheap model" delay={12} />
        <Figure label="Free path" value="0" sub="rules and cache — most turns" delay={26} color={C.ok} />
        <Figure label="Margin per turn" value="78%" sub="worst case, every language" delay={40} color={C.hivis} />
        <Figure label="Work returned" value="14 min" sub="per work order, conservatively" delay={54} />
      </div>

      <Rise delay={78} style={{ marginTop: 34 }}>
        <Panel accent={C.ok}>
          <div style={{ fontFamily: F.sans, fontSize: 31, color: C.paper, lineHeight: 1.45 }}>
            Rules → cache → budget check → cheap model → reasoning model.{" "}
            <span style={{ color: C.hivis }}>&ldquo;The pressure is 8.7 bar&rdquo;</span> is parsed deterministically
            and costs nothing at all.
          </div>
        </Panel>
      </Rise>

      <Caption delay={170}>
        Ten Indian languages. Hindi, spoken reply: ₹0.65 a turn, 73% margin — tested, not estimated.
      </Caption>
    </AbsoluteFill>
  );
};
