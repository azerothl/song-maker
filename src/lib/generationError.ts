import { profileLocale, t } from "../ui/i18n";

const DURATION_MISMATCH = /GENERATION_DURATION_MISMATCH\|(\d+)\|(\d+)/;

function formatSeconds(milliseconds: string): string {
  return (Number(milliseconds) / 1000).toLocaleString(profileLocale(), {
    maximumFractionDigits: 1,
  });
}

export function generationErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  const durationMismatch = DURATION_MISMATCH.exec(message);
  if (!durationMismatch) return message;

  return t("generation.durationMismatch", {
    expected: formatSeconds(durationMismatch[1]),
    actual: formatSeconds(durationMismatch[2]),
  });
}
