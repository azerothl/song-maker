import { profileLocale, t } from "../ui/i18n";

/** Track count label on expanded group headers (#225). */
export function formatMixGroupTrackCount(count: number): string {
  if (count === 1) {
    return t("mix.group.trackCount.one");
  }
  return t("mix.group.trackCount", { count });
}

/** Collapsed group summary (#225 — FR 0/1 → one, EN 0 → other). */
export function formatMixGroupCollapsedSummary(count: number, names: string): string {
  const loc = profileLocale();
  if (loc === "en") {
    if (count === 1) {
      return t("mix.group.collapsedSummary.one", { names });
    }
    return t("mix.group.collapsedSummary", { count, names });
  }
  if (count === 1) {
    return t("mix.group.collapsedSummary.one", { names });
  }
  return t("mix.group.collapsedSummary", { count, names });
}
