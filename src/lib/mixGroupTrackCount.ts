import { profileLocale, t } from "../ui/i18n";

/** Track count label on expanded group headers (#225). */
export function formatMixGroupTrackCount(count: number): string {
  if (new Intl.PluralRules(profileLocale()).select(count) === "one") {
    return t("mix.group.trackCount.one", { count });
  }
  return t("mix.group.trackCount", { count });
}

/** Collapsed group summary (#225 — FR 0/1 → one, EN 0 → other). */
export function formatMixGroupCollapsedSummary(count: number, names: string): string {
  if (new Intl.PluralRules(profileLocale()).select(count) === "one") {
    return t("mix.group.collapsedSummary.one", { count, names });
  }
  return t("mix.group.collapsedSummary", { count, names });
}
