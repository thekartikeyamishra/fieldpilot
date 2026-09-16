import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";

/** Uppercase tracked micro-label — the legend on an instrument panel. */
export const Legend: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.steel }) => (
  <div style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: 3.4, textTransform: "uppercase", color }}>
    {children}
  </div>
);

export const Panel: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}> = ({ children, style, accent }) => (
  <div
    style={{
      background: C.panel,
      border: `1px solid ${accent ?? C.panelLine}`,
      borderRadius: 6,
      padding: 28,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Spring-driven rise. Used everywhere so motion has one grammar, not five. */
export const Rise: React.FC<{
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, distance = 26, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * distance}px)`, ...style }}>{children}</div>
  );
};

/** Types text at a readable pace. Never faster than a viewer can follow. */
export const Typed: React.FC<{ text: string; start: number; cps?: number; style?: React.CSSProperties }> = ({
  text,
  start,
  cps = 32,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  return <span style={style}>{text.slice(0, shown)}</span>;
};

/** The product's signature element: a segmented state rail. */
export const StateRail: React.FC<{ stages: string[]; active: number }> = ({ stages, active }) => (
  <div style={{ display: "flex", gap: 6, width: "100%" }}>
    {stages.map((s, i) => (
      <div key={s} style={{ flex: 1 }}>
        <div
          style={{
            height: 4,
            background: i < active ? C.signal : i === active ? C.hivis : C.panelLine,
            borderRadius: 2,
            transition: "background 200ms",
          }}
        />
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            marginTop: 8,
            color: i <= active ? C.steelLight : C.steel,
          }}
        >
          {s}
        </div>
      </div>
    ))}
  </div>
);

/** Live microphone level. Deterministic per frame so renders are reproducible. */
export const Waveform: React.FC<{ bars?: number; amplitude?: number; color?: string }> = ({
  bars = 48,
  amplitude = 1,
  color = C.hivis,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 64 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h =
          (Math.sin((frame + i * 7) / 5) * 0.5 + Math.sin((frame + i * 3) / 11) * 0.5 + 1.1) *
          16 *
          amplitude;
        return <div key={i} style={{ width: 4, height: Math.max(3, h), background: color, borderRadius: 2 }} />;
      })}
    </div>
  );
};

/** House mark: a quarter-sweep gauge. */
export const GaugeMark: React.FC<{ size?: number; progress?: number }> = ({ size = 64, progress = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="19" stroke={C.panelLine} strokeWidth="2.5" />
    <path
      d="M24 5a19 19 0 0 1 16.45 9.5"
      stroke={C.hivis}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeDasharray="30"
      strokeDashoffset={30 * (1 - progress)}
    />
    <path d="M24 24l9-7" stroke={C.signal} strokeWidth="3" strokeLinecap="round" />
    <circle cx="24" cy="24" r="3" fill={C.signal} />
  </svg>
);

export const Caption: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: F.sans,
        fontSize: 26,
        color: C.steelLight,
        opacity: o,
        padding: "0 120px",
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
};
