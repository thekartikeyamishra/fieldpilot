/**
 * The same tokens the product uses. A demo that invents its own palette teaches
 * a viewer a product that does not exist — and the moment they open the real
 * thing, the video has cost you credibility rather than built it.
 */
export const C = {
  ink: "#0B1013",
  panel: "#121B20",
  panelLine: "#26343C",
  steel: "#5B6E79",
  steelLight: "#B8C4CB",
  paper: "#EEF1F4",
  hivis: "#F2C230",
  signal: "#2E90D9",
  ok: "#2BA36B",
  warn: "#D98324",
  danger: "#D94A3D",
} as const;

export const F = {
  sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
  // Anything the SYSTEM asserts as fact — asset tags, readings, costs, ids —
  // is set in mono. Language is set in sans. Same rule as the product.
  mono: '"JetBrains Mono", "Cascadia Mono", ui-monospace, "Roboto Mono", monospace',
} as const;

export const FPS = 30;

/** Scene durations in frames, in one place so the timeline is readable. */
export const SCENES = {
  hook: 7 * FPS,
  problem: 14 * FPS,
  title: 5 * FPS,
  speak: 11 * FPS,
  evidence: 13 * FPS,
  approve: 12 * FPS,
  architecture: 13 * FPS,
  economics: 11 * FPS,
  close: 8 * FPS,
} as const;

export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);
