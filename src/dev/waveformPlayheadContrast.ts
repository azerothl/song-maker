/** Contraste curseur de lecture vs zone jouée (WCAG 1.4.11, seuil 3:1). */

import {
  WCAG_UI_CONTRAST_MIN,
  WAVE_PLAYHEAD_OUTLINE,
  WAVE_PLAYHEAD_STROKE,
} from "../lib/trackRoleColors";

export { WCAG_UI_CONTRAST_MIN, WAVE_PLAYHEAD_STROKE };
export const WAVE_PLAYHEAD_HALO = WAVE_PLAYHEAD_OUTLINE;

type Rgb = { r: number; g: number; b: number };

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseCssColor(input: string): Rgb & { a: number } | null {
  const t = input.trim();
  const hex = t.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = t.match(
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

/** Résout une couleur CSS (y compris `var(--x)`) sur un élément. */
export function resolveComputedColor(el: Element, prop: string): string {
  const style = getComputedStyle(el);
  const raw = style.getPropertyValue(prop).trim();
  if (raw) return raw;
  if (prop.startsWith("--")) {
    return style.getPropertyValue(prop).trim();
  }
  return style.color;
}

export type PlayheadContrastMetrics = {
  playheadStrokeCss: string;
  playheadHaloCss: string;
  playedFillSampleRgb: Rgb;
  playheadEdgePixelRgb: Rgb;
  playedComputedVar: string | null;
  /** Contraste du contour sombre du curseur sur la zone jouée (critère WCAG 1.4.11). */
  contrastRatioHaloOnPlayed: number;
  contrastRatioWorstScan: number;
  contrastRatio: number;
  wcag1411Pass: boolean;
  playheadXCssPx: number;
};

/**
 * Mesure le pire contraste entre le curseur et la zone jouée sur le canvas master.
 * À appeler après rendu, avec `progress` au milieu du morceau.
 */
export function measureMasterWavePlayheadContrast(): PlayheadContrastMetrics | null {
  const canvas = document.querySelector(
    ".mix-master-wave .waveform-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const widthCss = canvas.clientWidth;
  const heightCss = canvas.clientHeight;
  if (widthCss < 8 || heightCss < 8) return null;

  const style = getComputedStyle(canvas);
  const playedVar = style.getPropertyValue("--track-wave-played").trim() || null;
  const waveVar = style.getPropertyValue("--track-wave").trim() || null;
  let playedResolved: string | null = playedVar;
  const varRef = playedVar?.match(/^var\((--[^)]+)\)$/);
  if (varRef) {
    playedResolved =
      getComputedStyle(document.documentElement).getPropertyValue(varRef[1]!).trim() ||
      playedVar;
  }

  const dpr = canvas.width / widthCss;
  const midY = Math.floor((heightCss / 2) * dpr);

  let playheadXCss = Math.floor(widthCss / 2);
  const ariaNow = Number(canvas.getAttribute("aria-valuenow") ?? "0");
  const ariaMax = Number(canvas.getAttribute("aria-valuemax") ?? "0");
  if (ariaMax > 0 && Number.isFinite(ariaNow)) {
    playheadXCss = Math.round((ariaNow / ariaMax) * widthCss);
  }
  playheadXCss = Math.max(2, Math.min(widthCss - 2, playheadXCss));
  const playheadX = Math.floor(playheadXCss * dpr);

  const readPx = (x: number, y: number): Rgb => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0]!, g: d[1]!, b: d[2]! };
  };

  let playedFillSampleRgb: Rgb = { r: 94, g: 236, b: 248 };
  let bestPlayedScore = -1;
  let worstContrast = Infinity;

  for (let y = Math.floor(2 * dpr); y < canvas.height - Math.floor(2 * dpr); y++) {
    for (
      let x = playheadX - Math.floor(18 * dpr);
      x <= playheadX - Math.floor(4 * dpr);
      x += Math.max(1, Math.floor(dpr))
    ) {
      if (x < 0) continue;
      const playedPx = readPx(x, y);
      const playedScore = playedPx.g + playedPx.b - playedPx.r;
      if (playedScore > bestPlayedScore) {
        bestPlayedScore = playedScore;
        playedFillSampleRgb = playedPx;
      }
    }

    const playedPx = playedFillSampleRgb;
    for (const headX of [
      playheadX - Math.floor(2 * dpr),
      playheadX - Math.floor(1 * dpr),
      playheadX,
      playheadX + Math.floor(1 * dpr),
    ]) {
      if (headX < 0 || headX >= canvas.width) continue;
      const headPx = readPx(headX, y);
      const ratio = contrastRatio(playedPx, headPx);
      if (ratio < worstContrast) worstContrast = ratio;
    }
  }

  const haloParsed = parseCssColor(WAVE_PLAYHEAD_HALO);
  const haloEdgeX = Math.max(0, playheadX - Math.floor(2 * dpr));
  const playheadEdgePixelRgb = readPx(haloEdgeX, midY);

  const ratioHaloSpec =
    haloParsed != null ? contrastRatio(playedFillSampleRgb, haloParsed) : 0;
  const ratioHaloPixel = contrastRatio(playedFillSampleRgb, playheadEdgePixelRgb);
  const contrastRatioHaloOnPlayed = Math.min(ratioHaloSpec, ratioHaloPixel);
  const contrast = contrastRatioHaloOnPlayed;

  return {
    playheadStrokeCss: WAVE_PLAYHEAD_STROKE,
    playheadHaloCss: WAVE_PLAYHEAD_HALO,
    playedFillSampleRgb,
    playheadEdgePixelRgb,
    playedComputedVar: playedResolved || playedVar || waveVar,
    contrastRatioHaloOnPlayed: Math.round(contrastRatioHaloOnPlayed * 100) / 100,
    contrastRatioWorstScan: Math.round(worstContrast * 100) / 100,
    contrastRatio: Math.round(contrast * 100) / 100,
    wcag1411Pass: contrast >= WCAG_UI_CONTRAST_MIN,
    playheadXCssPx: playheadXCss,
  };
}
