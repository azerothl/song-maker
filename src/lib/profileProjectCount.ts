import { t } from "../ui/i18n";

/** Singular/plural project count for profile cards and menus (#210). */
export function formatProfileProjectCount(count: number): string {
  if (count <= 0) {
    return t("profiles.projects.none");
  }
  if (count === 1) {
    return t("profiles.projects.one");
  }
  return t("profiles.projects.many", { count });
}
