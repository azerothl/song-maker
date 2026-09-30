/** Contraste WCAG 2.2 AA des boutons `.btn.primary` (#186). */

import {
  contrastRatio,
  contrastRatioFromCssColors,
  cssRgbToHex,
} from "./sidebarContrast";

export const PRIMARY_BUTTON_TEXT = "#151827";
export const PRIMARY_BUTTON_GRADIENT_TOP = "#c4a8ff";
export const PRIMARY_BUTTON_GRADIENT_BOTTOM = "#a78bfa";
/** Texte désactivé — 5,36:1 sur fond `#12151f` (I2 #186), distinct du secondaire (#193). */
export const PRIMARY_BUTTON_DISABLED_TEXT = "#848ba0";
export const PRIMARY_BUTTON_DISABLED_BG = "#12151f";
export const PRIMARY_BUTTON_DISABLED_TEXT_RATIO_ON_FACE = contrastRatio(
  PRIMARY_BUTTON_DISABLED_TEXT,
  PRIMARY_BUTTON_DISABLED_BG,
);

/** Anneau focus I3 — séparation cyan / face (liseré inset). */
export const PRIMARY_BUTTON_FOCUS_RING = "#5eecf8";
export const PRIMARY_BUTTON_FOCUS_INSET_SEP = "#151827";
export const PRIMARY_BUTTON_FOCUS_INSET_MIN_CONTRAST_ON_FACE = 3;

export const WCAG_AA_TEXT_MIN = 4.5;
/** Plancher lisibilité état désactivé (#193). */
export const DISABLED_TEXT_MIN = 3;

export const PRIMARY_BUTTON_WORST_GRADIENT_CONTRAST = contrastRatio(
  PRIMARY_BUTTON_TEXT,
  PRIMARY_BUTTON_GRADIENT_TOP,
);

const GRADIENT_STOP_RE =
  /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|#[0-9a-f]{3,8}/gi;

export type PrimaryButtonContrastState = "normal" | "hover" | "focus" | "disabled";

export type PrimaryButtonDomMeasure = {
  state: PrimaryButtonContrastState;
  foregroundCss: string;
  foregroundHex: string | null;
  backgroundSource: "computed-gradient-stops" | "computed-background-color";
  backgroundStopsCss: string[];
  backgroundStopsHex: string[];
  /** Pire ratio entre le texte et chaque stop du dégradé (mesuré depuis le DOM). */
  worstStopContrast: number | null;
  /** Ratio texte / fond si `background-color` opaque (sans dégradé). */
  flatBackgroundContrast: number | null;
  passAa: boolean;
};

function parseGradientStops(backgroundImage: string): string[] {
  if (!backgroundImage || backgroundImage === "none") return [];
  const matches = backgroundImage.match(GRADIENT_STOP_RE);
  return matches ?? [];
}

function worstContrastOnStops(fgHex: string, stops: string[]): number | null {
  if (!fgHex || stops.length === 0) return null;
  let worst = Infinity;
  for (const stop of stops) {
    const bgHex = cssRgbToHex(stop) ?? (stop.startsWith("#") ? stop : null);
    if (!bgHex) continue;
    worst = Math.min(worst, contrastRatio(fgHex, bgHex));
  }
  return Number.isFinite(worst) ? worst : null;
}

/** Mesure le contraste d’un bouton primaire à partir des styles calculés (navigateur / Playwright). */
export function measurePrimaryButtonFromDom(
  button: Element,
  state: PrimaryButtonContrastState,
): PrimaryButtonDomMeasure {
  const style = getComputedStyle(button);
  const foregroundCss = style.color;
  const foregroundHex = cssRgbToHex(foregroundCss);
  const bgColor = style.backgroundColor;
  const stopsCss = parseGradientStops(style.backgroundImage);
  const stopsHex = stopsCss
    .map((s) => cssRgbToHex(s) ?? (s.startsWith("#") ? s.toLowerCase() : null))
    .filter((h): h is string => h != null);

  const worstStopContrast =
    foregroundHex != null ? worstContrastOnStops(foregroundHex, stopsCss) : null;
  const flatBackgroundContrast = contrastRatioFromCssColors(foregroundCss, bgColor);

  const ratio =
    worstStopContrast ??
    (flatBackgroundContrast != null && !bgColor.includes("0, 0, 0, 0")
      ? flatBackgroundContrast
      : null) ??
    0;

  return {
    state,
    foregroundCss,
    foregroundHex,
    backgroundSource:
      stopsCss.length > 0 ? "computed-gradient-stops" : "computed-background-color",
    backgroundStopsCss: stopsCss,
    backgroundStopsHex: stopsHex,
    worstStopContrast,
    flatBackgroundContrast,
    passAa: ratio >= WCAG_AA_TEXT_MIN,
  };
}

export function measurePrimaryButtonStatesFromDom(
  button: HTMLButtonElement,
): PrimaryButtonDomMeasure[] {
  const results: PrimaryButtonDomMeasure[] = [];
  results.push(measurePrimaryButtonFromDom(button, "normal"));
  button.focus();
  results.push(measurePrimaryButtonFromDom(button, "focus"));
  button.blur();

  const wasDisabled = button.disabled;
  button.disabled = true;
  results.push(measurePrimaryButtonFromDom(button, "disabled"));
  button.disabled = wasDisabled;

  return results;
}
