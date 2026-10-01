/**
 * Source unique des couleurs stem (pastille + waveform) — #159.
 * Les hex de `:root --stem-*` dans App.css doivent rester alignés avec TRACK_ROLE_COLORS.
 */

export const PRODUCTION_BG0 = "#0c0e18";

/** Fond réel des waveforms de piste (`.production-mix-wave .waveform-frame`). */
export const PRODUCTION_WAVE_TRACK_BG = "#171320";

const RAW_STEM_COLORS: Record<string, string> = {
  vocals: "#ff8fb1",
  drums: "#5ed8c9",
  bass: "#7fe0a1",
  other: "#9ee06a",
  guitar: "#b79cff",
  piano: "#ffd76a",
  percussion: "#5ed8c9",
};

/** Opacité partie à venir (65 %) sur le fond réel de la waveform. */
export const WAVE_UNPLAYED_ALPHA = 0.65;

/** Éclaircissement HSL partie lue : +8…+12 points, plafond 88 % L. */
export const WAVE_PLAYED_LIGHTNESS_DELTA = 10;

/** Seuil L (%) au-delà duquel on renforce un peu la saturation (ex. piano). */
export const WAVE_PLAYED_SAT_BOOST_LIGHTNESS = 72;

export const WAVE_PLAYED_SAT_BOOST = 10;

export const WAVE_PLAYHEAD_STROKE = "#ffffff";
export const WAVE_PLAYHEAD_OUTLINE = "#1a1424";

export const WCAG_UI_CONTRAST_MIN = 3;

export const WAVE_PLAYED_VS_UNPLAYED_MIN = 1.3;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

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

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  const max = Math.max(rs, gs, bs);
  const min = Math.min(rs, gs, bs);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rs) h = ((gs - bs) / d + (gs < bs ? 6 : 0)) / 6;
  else if (max === gs) h = ((bs - rs) / d + 2) / 6;
  else h = ((rs - gs) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = clamp01(s / 100);
  const ll = clamp01(l / 100);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue2rgb = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  };
}

/** Éclaircit en HSL (teinte conservée, pas de push vers le blanc RGB). */
export function playedStemColorHsl(
  baseHex: string,
  lightnessDelta = WAVE_PLAYED_LIGHTNESS_DELTA,
): string {
  const parsed = parseCssColor(baseHex);
  if (!parsed) return baseHex.trim();
  const hsl = rgbToHsl(parsed);
  let { h, s, l } = hsl;
  l = Math.min(88, l + lightnessDelta);
  if (l >= WAVE_PLAYED_SAT_BOOST_LIGHTNESS) {
    s = Math.min(100, s + WAVE_PLAYED_SAT_BOOST);
  }
  return toHex(hslToRgb({ h, s, l }));
}

/** Si la base est trop sombre à 65 %, on éclaircit cette stem uniquement. */
export function ensureStemBaseContrast(
  baseHex: string,
  bg: string = PRODUCTION_BG0,
  alpha: number = WAVE_UNPLAYED_ALPHA,
): string {
  let current = baseHex.toLowerCase();
  for (let step = 0; step < 32; step++) {
    const composite = blendOverBackground(current, bg, alpha);
    if (contrastRatio(composite, bg) >= WCAG_UI_CONTRAST_MIN) {
      return current;
    }
    const parsed = parseCssColor(current);
    if (!parsed) return current;
    const hsl = rgbToHsl(parsed);
    hsl.l = Math.min(88, hsl.l + 4);
    current = toHex(hslToRgb(hsl));
  }
  return current;
}

function buildAdjustedStemColors(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, raw] of Object.entries(RAW_STEM_COLORS)) {
    out[role] = ensureStemBaseContrast(raw);
  }
  return out;
}

export const TRACK_ROLE_COLORS: Record<string, string> = buildAdjustedStemColors();

export const DEFAULT_WAVE_COLOR = TRACK_ROLE_COLORS.other!;
export const DEFAULT_WAVE_PLAYED = TRACK_ROLE_COLORS.drums!;

export function roleWaveColor(role: string | undefined | null): string {
  if (!role) return DEFAULT_WAVE_COLOR;
  return TRACK_ROLE_COLORS[role.toLowerCase()] ?? DEFAULT_WAVE_COLOR;
}

/** Apply alpha to `#rrggbb` or `rgb(r,g,b)` / `rgba(...)` color strings. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseCssColor(color);
  if (!parsed) return color.trim();
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${clamp01(alpha)})`;
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

export const STEM_CONTRAST_ROLES = [
  "vocals",
  "drums",
  "bass",
  "guitar",
  "piano",
  "other",
] as const;

export type StemContrastRow = {
  role: string;
  solidHex: string;
  rawHex: string;
  upcomingCompositeHex: string;
  upcomingContrast: number;
  playedHex: string;
  playedVsUpcomingContrast: number;
  upcomingPass: boolean;
  playedVsUpcomingPass: boolean;
};

export function measureStemContrasts(
  bg: string = PRODUCTION_BG0,
  unplayedAlpha: number = WAVE_UNPLAYED_ALPHA,
): StemContrastRow[] {
  return STEM_CONTRAST_ROLES.map((role) => {
    const rawHex = RAW_STEM_COLORS[role]!.toLowerCase();
    const solidHex = TRACK_ROLE_COLORS[role]!.toLowerCase();
    const upcomingCompositeHex = blendOverBackground(solidHex, bg, unplayedAlpha);
    const playedHex = playedStemColorHsl(solidHex);
    const upcomingContrast = contrastRatio(upcomingCompositeHex, bg);
    const playedVsUpcomingContrast = contrastRatio(playedHex, upcomingCompositeHex);
    return {
      role,
      solidHex,
      rawHex,
      upcomingCompositeHex,
      upcomingContrast,
      playedHex,
      playedVsUpcomingContrast,
      upcomingPass: upcomingContrast >= WCAG_UI_CONTRAST_MIN,
      playedVsUpcomingPass: playedVsUpcomingContrast >= WAVE_PLAYED_VS_UNPLAYED_MIN,
    };
  });
}

/** @deprecated Utiliser playedStemColorHsl — conservé pour les tests de régression. */
export function lightenColor(color: string, amount = 0.18): string {
  const parsed = parseCssColor(color);
  if (!parsed) return color.trim();
  const t = clamp01(amount);
  return toHex({
    r: Math.round(parsed.r + (255 - parsed.r) * t),
    g: Math.round(parsed.g + (255 - parsed.g) * t),
    b: Math.round(parsed.b + (255 - parsed.b) * t),
  });
}

export function resolveWaveFillColors(base: string): {
  unplayed: string;
  played: string;
} {
  return {
    unplayed: withAlpha(base, WAVE_UNPLAYED_ALPHA),
    played: playedStemColorHsl(base),
  };
}
