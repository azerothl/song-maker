/** Mesure contraste `.btn.primary` depuis styles calculés (harness #186). */

import {
  contrastRatio,
  cssRgbToHex,
} from "./sidebarContrast";

export const WCAG_AA_TEXT_MIN = 4.5;

const GRADIENT_STOP_RE =
  /(?:rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|color\(srgb[\s\d.]+\)|#[0-9a-f]{3,8})/gi;

function cssColorToHex(css: string): string | null {
  const fromRgb = cssRgbToHex(css);
  if (fromRgb) return fromRgb;
  const trimmed = css.trim();
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(trimmed);
  if (srgb) {
    const toHex = (f: number) => Math.round(Number(f) * 255).toString(16).padStart(2, "0");
    return `#${toHex(Number(srgb[1]))}${toHex(Number(srgb[2]))}${toHex(Number(srgb[3]))}`;
  }
  if (trimmed.startsWith("#")) return trimmed.toLowerCase();
  return null;
}

export type PrimaryButtonContrastState = "normal" | "hover" | "focus" | "disabled";

export type PrimaryButtonDomMeasure = {
  state: PrimaryButtonContrastState;
  foregroundCss: string;
  foregroundHex: string | null;
  backgroundStopsCss: string[];
  worstStopContrast: number | null;
  flatBackgroundContrast: number | null;
  effectiveContrast: number | null;
  passAa: boolean;
};

function parseGradientStops(backgroundImage: string): string[] {
  if (!backgroundImage || backgroundImage === "none") return [];
  return backgroundImage.match(GRADIENT_STOP_RE) ?? [];
}

function worstContrastOnStops(fgHex: string, stops: string[]): number | null {
  if (!fgHex || stops.length === 0) return null;
  let worst = Infinity;
  for (const stop of stops) {
    const bgHex = cssColorToHex(stop);
    if (!bgHex) continue;
    worst = Math.min(worst, contrastRatio(fgHex, bgHex));
  }
  return Number.isFinite(worst) ? worst : null;
}

export function measurePrimaryButtonFromDom(
  button: Element,
  state: PrimaryButtonContrastState,
): PrimaryButtonDomMeasure {
  const style = getComputedStyle(button);
  const foregroundCss = style.color;
  const foregroundHex = cssColorToHex(foregroundCss);
  const bgColor = style.backgroundColor;
  const stopsCss = parseGradientStops(style.backgroundImage);

  const worstStopContrast =
    foregroundHex != null ? worstContrastOnStops(foregroundHex, stopsCss) : null;
  const flatHex = cssColorToHex(bgColor);
  const flatBackgroundContrast =
    foregroundHex && flatHex ? contrastRatio(foregroundHex, flatHex) : null;
  const effectiveContrast =
    worstStopContrast ??
    (flatBackgroundContrast != null &&
    flatHex &&
    !bgColor.includes("0, 0, 0, 0") &&
    bgColor !== "rgba(0, 0, 0, 0)"
      ? flatBackgroundContrast
      : null);

  return {
    state,
    foregroundCss,
    foregroundHex,
    backgroundStopsCss: stopsCss,
    worstStopContrast:
      worstStopContrast != null ? Math.round(worstStopContrast * 100) / 100 : null,
    flatBackgroundContrast:
      flatBackgroundContrast != null ? Math.round(flatBackgroundContrast * 100) / 100 : null,
    effectiveContrast:
      effectiveContrast != null ? Math.round(effectiveContrast * 100) / 100 : null,
    passAa: (effectiveContrast ?? 0) >= WCAG_AA_TEXT_MIN,
  };
}
