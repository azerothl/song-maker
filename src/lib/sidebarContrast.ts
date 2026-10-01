/** Contrastes WCAG pour la barre latérale (alignement maquette #155). */

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Tokens maquette sidebar-repliable */
export const SIDEBAR_HOVER_TEXT = "#f3f0fa";
export const SIDEBAR_HOVER_BG = "#2f2a3d";

export const SIDEBAR_HOVER_CONTRAST_RATIO = contrastRatio(
  SIDEBAR_HOVER_TEXT,
  SIDEBAR_HOVER_BG,
);

const CSS_RGB_RE =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i;

/** Convertit `rgb()` / `rgba()` en hex 6 chiffres pour mesure DOM. */
export function cssRgbToHex(css: string): string | null {
  const trimmed = css.trim();
  if (trimmed.startsWith("#")) {
    const h = trimmed.replace("#", "");
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
    }
    if (h.length === 6) return `#${h}`.toLowerCase();
    return null;
  }
  const m = CSS_RGB_RE.exec(trimmed);
  if (!m) return null;
  const r = Math.round(Number(m[1]));
  const g = Math.round(Number(m[2]));
  const b = Math.round(Number(m[3]));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function contrastRatioFromCssColors(fgCss: string, bgCss: string): number | null {
  const fg = cssRgbToHex(fgCss);
  const bg = cssRgbToHex(bgCss);
  if (!fg || !bg) return null;
  return contrastRatio(fg, bg);
}
