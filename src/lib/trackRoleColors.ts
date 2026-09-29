/**
 * Single stem-color source for Production (pastille + waveform).
 * Hex values mirror `:root --stem-*` in App.css and the Production densite maquette.
 * Keep CSS custom properties and this map in lockstep (#159).
 */

export const PRODUCTION_BG0 = "#0c0e18";

/** Canonical stem accents (6 HTDemucs roles + aliases). */
export const TRACK_ROLE_COLORS: Record<string, string> = {
  vocals: "#ff8fb1",
  drums: "#5ed8c9",
  bass: "#7fe0a1",
  other: "#9ee06a",
  guitar: "#b79cff",
  piano: "#ffd76a",
  /** Percussion falls back to drums accent when no dedicated token. */
  percussion: "#5ed8c9",
};

export const DEFAULT_WAVE_COLOR = TRACK_ROLE_COLORS.other!;
export const DEFAULT_WAVE_PLAYED = TRACK_ROLE_COLORS.drums!;

/** Upcoming (unplayed) waveform opacity — Alphonse ~65 % for WCAG 1.4.11 ≥ 3:1 on #0C0E18. */
export const WAVE_UNPLAYED_ALPHA = 0.65;

/** Mix toward white for the played segment (moderate lightening, no halo). */
export const WAVE_PLAYED_LIGHTEN = 0.18;

export const WAVE_PLAYHEAD_STROKE = "#ffffff";
export const WAVE_PLAYHEAD_OUTLINE = "#1a1424";

export const WCAG_UI_CONTRAST_MIN = 3;

export function roleWaveColor(role: string | undefined | null): string {
  if (!role) return DEFAULT_WAVE_COLOR;
  return TRACK_ROLE_COLORS[role.toLowerCase()] ?? DEFAULT_WAVE_COLOR;
}

type Rgb = { r: number; g: number; b: number };

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function parseCssColor(input: string): (Rgb & { a: number }) | null {
  const trimmed = input.trim();
  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgb) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
      a: rgb[4] != null ? clamp01(Number(rgb[4])) : 1,
    };
  }
  return null;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Apply alpha to `#rrggbb` or `rgb(r,g,b)` / `rgba(...)` color strings. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseCssColor(color);
  if (!parsed) return color.trim();
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${clamp01(alpha)})`;
}

/** Moderate lightening toward white (played waveform fill). */
export function lightenColor(color: string, amount = WAVE_PLAYED_LIGHTEN): string {
  const parsed = parseCssColor(color);
  if (!parsed) return color.trim();
  const t = clamp01(amount);
  return toHex({
    r: Math.round(parsed.r + (255 - parsed.r) * t),
    g: Math.round(parsed.g + (255 - parsed.g) * t),
    b: Math.round(parsed.b + (255 - parsed.b) * t),
  });
}

/** Composite `fg` over `bg` with opacity `alpha` (both opaque hex/rgb). */
export function blendOverBackground(
  fg: string,
  bg: string,
  alpha: number,
): string {
  const f = parseCssColor(fg);
  const b = parseCssColor(bg);
  if (!f || !b) return fg.trim();
  const a = clamp01(alpha);
  return toHex({
    r: Math.round(a * f.r + (1 - a) * b.r),
    g: Math.round(a * f.g + (1 - a) * b.g),
    b: Math.round(a * f.b + (1 - a) * b.b),
  });
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number {
  const parsed = parseCssColor(color);
  if (!parsed) return 0;
  const R = srgbToLinear(parsed.r);
  const G = srgbToLinear(parsed.g);
  const B = srgbToLinear(parsed.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type StemContrastRow = {
  role: string;
  solidHex: string;
  upcomingCompositeHex: string;
  upcomingContrast: number;
  playedHex: string;
  playedContrast: number;
  upcomingPass: boolean;
  playedPass: boolean;
};

/** Six stem roles measured for WCAG 1.4.11 on the real Production background. */
export const STEM_CONTRAST_ROLES = [
  "vocals",
  "drums",
  "bass",
  "guitar",
  "piano",
  "other",
] as const;

export function measureStemContrasts(
  bg: string = PRODUCTION_BG0,
  unplayedAlpha: number = WAVE_UNPLAYED_ALPHA,
): StemContrastRow[] {
  return STEM_CONTRAST_ROLES.map((role) => {
    const solidHex = TRACK_ROLE_COLORS[role]!;
    const upcomingCompositeHex = blendOverBackground(solidHex, bg, unplayedAlpha);
    const playedHex = lightenColor(solidHex, WAVE_PLAYED_LIGHTEN);
    const upcomingContrast = contrastRatio(upcomingCompositeHex, bg);
    const playedContrast = contrastRatio(playedHex, bg);
    return {
      role,
      solidHex,
      upcomingCompositeHex,
      upcomingContrast,
      playedHex,
      playedContrast,
      upcomingPass: upcomingContrast >= WCAG_UI_CONTRAST_MIN,
      playedPass: playedContrast >= WCAG_UI_CONTRAST_MIN,
    };
  });
}

/** Resolve waveform fill colors from one stem base color. */
export function resolveWaveFillColors(base: string): {
  unplayed: string;
  played: string;
} {
  return {
    unplayed: withAlpha(base, WAVE_UNPLAYED_ALPHA),
    played: lightenColor(base, WAVE_PLAYED_LIGHTEN),
  };
}
