import { profileLocale } from "../ui/i18n";

/**
 * Affichage « m:ss.s » / « m:ss,s » pour positions et durées affichées (#228).
 * FR : virgule décimale ; EN : point. Les champs numériques en ms entiers
 * ne passent pas par cette fonction.
 */
export function formatMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  const loc = profileLocale();
  const dec = loc === "en" ? "." : ",";
  const secStr = rest.toFixed(1).replace(".", dec);
  const padded = secStr.length < 4 ? secStr.padStart(4, "0") : secStr;
  return `${m}:${padded}`;
}

/** Alias historique (#226) — même format que `formatMs`. */
export function formatMsForClipLabel(ms: number): string {
  return formatMs(ms);
}
