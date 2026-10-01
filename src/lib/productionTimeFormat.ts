import { profileLocale } from "../ui/i18n";

/** Affichage « Clip n · m:ss.s » avec séparateur décimal selon la langue (#228 / #226). */
export function formatMsForClipLabel(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  const loc = profileLocale();
  const dec = loc === "en" ? "." : ",";
  const secStr = rest.toFixed(1).replace(".", dec);
  const padded = secStr.length < 4 ? secStr.padStart(4, "0") : secStr;
  return `${m}:${padded}`;
}
