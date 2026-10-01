import { t } from "../ui/i18n";

/** Mappe les erreurs score-engine (messages FR internes) vers des clés i18n (#226 B3). */
export function clipFadeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("fondus trop longs")) {
    return t("production.fade.error.tooLong");
  }
  if (lower.includes("fadeinms") || lower.includes("fadeoutms")) {
    return t("production.fade.error.negative");
  }
  if (lower.includes("≥ 0") || lower.includes("doit être")) {
    return t("production.fade.error.negative");
  }
  return t("production.strip.invalid");
}
