import {
  buildCommercialEngineList,
  COMMERCIAL_GRAY_REASONS_EN,
  COMMERCIAL_GRAY_REASONS_FR,
  formatCommercialReservedBadge,
  licenseRowByDataId,
  primarySourceUrlForLicenseRow,
  type CommercialGrayReasonId,
  type CommercialEngineListEntry,
  type EngineLicenseRow201,
} from "@song-maker/stem-providers";
import { profileLocale, t } from "../ui/i18n";

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
  reservationNote: string | null;
  sourceLinks: { href: string; label: string }[];
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

function formatReleveDateFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function commercialGrayReasonLabel(
  grayReason: CommercialGrayReasonId,
): string {
  const table =
    profileLocale() === "en"
      ? COMMERCIAL_GRAY_REASONS_EN
      : COMMERCIAL_GRAY_REASONS_FR;
  return table[grayReason];
}

export function commercialEngineWhyLabel(
  engineId: string,
  row: EngineLicenseRow201 | null | undefined,
): string {
  if (engineId === "sheetsage2") {
    const iso = row?.date_releve_audio_cpp?.trim() || "2026-09-21";
    const date =
      profileLocale() === "en" ? iso : formatReleveDateFr(iso);
    return t("profiles.engines.whySheetsage2AudioCpp", { date });
  }
  const dated = row?.date_verification?.trim();
  return dated
    ? t("profiles.engines.whyWithDate", { date: dated })
    : t("profiles.engines.whyNoDate");
}

export function buildCommercialEngineRowsUi(
  entries: CommercialEngineListEntry[] = buildCommercialEngineList(),
): CommercialEngineRowUi[] {
  const locale = profileLocale();
  const aceStepSourceLabels = [
    t("profiles.engines.aceStepSource.original"),
    t("profiles.engines.aceStepSource.converted"),
    t("profiles.engines.aceStepSource.code"),
    t("profiles.engines.aceStepSource.runtime"),
    t("profiles.engines.aceStepSource.qwenEmbedding"),
    t("profiles.engines.aceStepSource.qwenLm"),
    t("profiles.engines.aceStepSource.vae"),
  ];
  return entries.map((entry) => {
    const row = entry.licenseRow;
    const whyHref = primarySourceUrlForLicenseRow(row);
    const reasonLabel = commercialGrayReasonLabel(entry.grayReason);
    const whyLabel = commercialEngineWhyLabel(entry.engine.id, row);
    return {
      id: entry.engine.id,
      name:
        locale === "en"
          ? entry.engine.displayNameEn
          : entry.engine.displayNameFr,
      categoryLabel: categoryLabelFr(entry.engine.category),
      grayReason: entry.grayReason,
      reasonLabel,
      whyHref,
      whyLabel,
      availability: entry.availability,
      reservedBadge:
        entry.availability === "reserved" && entry.licenseRow?.statut
          ? formatCommercialReservedBadge(
              entry.licenseRow.statut,
              locale === "en" ? "en" : "fr",
            )
          : null,
      reservedStatusLine: null,
      reservationNote:
        entry.availability === "reserved" && entry.engine.id === "ace_step_1_5"
          ? t("profiles.engines.aceStepReservation")
          : null,
      sourceLinks:
        entry.availability === "reserved" && entry.engine.id === "ace_step_1_5"
          ? (row?.source_url
              .split(";")
              .map((url) => url.trim())
              .filter((url) => /^https?:\/\//i.test(url))
              .map((href, index) => ({
                href,
                label: aceStepSourceLabels[index] ?? t("profiles.engines.why"),
              })) ?? [])
          : [],
    };
  });
}

export function licenseWhyLinkForDataId(dataId: string): {
  href: string;
  date: string | null;
} | null {
  const row = licenseRowByDataId(dataId);
  if (!row?.source_url) return null;
  const href = primarySourceUrlForLicenseRow(row);
  if (!href) return null;
  return {
    href,
    date: row.date_verification?.trim() || null,
  };
}
