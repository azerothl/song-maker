/** Role → accent colors matching `.track[data-role]` border accents in App.css. */

export const TRACK_ROLE_COLORS: Record<string, string> = {
  vocals: "#ff858d",
  drums: "#69d9e8",
  bass: "#8f71e8",
  other: "#b49aff",
  guitar: "#b49aff",
  piano: "#8f71e8",
};

export const DEFAULT_WAVE_COLOR = "#b49aff";
export const DEFAULT_WAVE_PLAYED = "#69d9e8";

export function roleWaveColor(role: string | undefined | null): string {
  if (!role) return DEFAULT_WAVE_COLOR;
  return TRACK_ROLE_COLORS[role.toLowerCase()] ?? DEFAULT_WAVE_COLOR;
}

/** Apply alpha to `#rrggbb` or `rgb(r,g,b)` / `rgba(...)` color strings. */
export function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
  );
  if (rgb) {
    return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;
  }
  return trimmed;
}
