// Single source of console colour truth for the GENERAL-005 workbench.
// No React import belongs here; this module is pure data + a WCAG helper.

export const consolePalette = {
  bg: "#0d1520",
  surface: "#121c28",
  surfaceRaised: "#16222f",

  ink: "#e4edf5",
  muted: "#8fa3b8",
  mutedDim: "#7d92a8",
  accent: "#22d3ee",
  accentSoft: "#0f2a35",
  accentStrong: "#0e7490",

  border: "#1f2d3d",
  borderStrong: "#2c3e52",
  borderInteractive: "#51708f",

  severityCritical: "#f87171",
  severityHigh: "#fb923c",
  severityMedium: "#fbbf24",
  severityLow: "#38bdf8",
  severityInfo: "#94a3b8",

  actionAllow: "#34d399",
  actionDeny: "#f87171",

  mono: "#e4edf5"
} as const;

export const consoleThemeTokens = {
  colorPrimary: consolePalette.accent,
  colorBgBase: consolePalette.bg,
  colorTextBase: consolePalette.ink,
  borderRadius: 6
} as const;

// WCAG 2.1 relative-luminance contrast ratio between two #rrggbb colours.
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
