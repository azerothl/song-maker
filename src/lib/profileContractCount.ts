import { t } from "../ui/i18n";

/** Singular/plural accepted-contract count for profile cards (#237). */
export function formatProfileContractCount(count: number): string {
  if (count <= 0) {
    return t("profiles.contracts.none");
  }
  if (count === 1) {
    return t("profiles.contracts.one");
  }
  return t("profiles.contracts.many", { count });
}
