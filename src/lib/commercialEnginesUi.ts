import {
  buildCommercialEngineList,
  COMMERCIAL_GRAY_REASONS_FR,
  licenseRowByDataId,
  type CommercialGrayReasonId,
  type CommercialEngineListEntry,
} from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

export type CommercialEngineRowUi = {
  id: string;
  name: string;
  categoryLabel: string;
  grayReason: CommercialGrayReasonId;
  reasonLabel: string;
  whyHref: string | null;
  whyLabel: string;
  availability: "reserved" | "grayed";
  reservedBadge: string | null;
  reservedStatusLine: string | null;
};

function categoryLabelFr(category: string): string {
  switch (category) {
    case "generation":
      return t("profiles.engines.category.generation");
    case "separation":
      return t("profiles.engines.category.separation");
    case "transcription":
      return t("profiles.engines.category.transcription");
    default:
      return category;
  }
}

function formatWhyUrl(sourceUrl: string): string {
  const first = sourceUrl.split(";")[0]?.trim() ?? sourceUrl;
  return first;
}

export function buildCommercialEngineRowsUi(
  entries: CommercialEngineListEntry[] = buildCommercialEngineList(),
): CommercialEngineRowUi[] {
  return entries.map((entry) => {
    const row = entry.licenseRow;
    const dated = row?.date_verification?.trim();
    const whyHref =
      row?.source_url ? formatWhyUrl(row.source_url) : null;
    const whyLabel = dated
      ? t("profiles.engines.whyWithDate", { date: dated })
      : t("profiles.engines.whyNoDate");
    return {
      id: entry.engine.id,
      name: entry.engine.displayNameFr,
      categoryLabel: categoryLabelFr(entry.engine.category),
      grayReason: entry.grayReason,
      reasonLabel: COMMERCIAL_GRAY_REASONS_FR[entry.grayReason],
      whyHref,
      whyLabel,
      availability: entry.availability,
      reservedBadge:
        entry.availability === "reserved" ? t("profiles.engines.reservedBadge") : null,
      reservedStatusLine: null,
    };
  });
}

export function licenseWhyLinkForDataId(dataId: string): {
  href: string;
  date: string | null;
} | null {
  const row = licenseRowByDataId(dataId);
  if (!row?.source_url) return null;
  return {
    href: formatWhyUrl(row.source_url),
    date: row.date_verification?.trim() || null,
  };
}
