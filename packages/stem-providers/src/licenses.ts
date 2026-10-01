import type { StemProviderId } from "./registry.js";

/**
 * Licence metadata for separator weights (#167).
 * Not legal advice — labels follow primary sources + Demucs #327.
 * NC weights (Banquet, ADTOF) and jarredou 6 stems stay out of the offered catalog.
 */

/** Typed licence status shown in the UI (icon + text). */
export type LicenseStatusKind =
  | "verified"
  | "unverified"
  | "non_commercial"
  | "excluded";

export type SeparatorLicenseInfo = {
  id: StemProviderId;
  /** Typed status: vérifié / non vérifié / non commercial / exclu. */
  status: LicenseStatusKind;
  /**
   * Date we read the cited primary source (ISO YYYY-MM-DD).
   * Required when status === "verified"; also set when we cite a dated statement.
   */
  readDate: string | null;
  /** Short badge text (status-aware). */
  badgeFr: string;
  /** Full notice before download / beside the model. */
  noticeFr: string;
  sourceUrl: string;
  sourceLabelFr: string;
  /** Weights may be downloaded / offered in the product. */
  offered: boolean;
  /** Requires explicit « J'ai lu la licence » before download. */
  requiresAcceptBeforeDownload: boolean;
};

export const LICENSE_STATUS_LABEL_FR: Record<LicenseStatusKind, string> = {
  verified: "vérifié",
  unverified: "non vérifié",
  non_commercial: "usage non commercial",
  excluded: "exclu",
};

/** Unicode icon paired with the status (not colour alone). */
export const LICENSE_STATUS_ICON: Record<LicenseStatusKind, string> = {
  verified: "✓",
  unverified: "!",
  non_commercial: "⊘",
  excluded: "✕",
};

/** Issue Demucs #327 (sans ancre comment — non revérifiée). */
export const DEMUCS_327_ISSUE_URL =
  "https://github.com/facebookresearch/demucs/issues/327";

/** Citation complète adefossez, 23 mai 2022 (Demucs #327). */
export const HTDEMUCS_MAINTAINER_STATEMENT_EN =
  "are not covered by the MIT license, and are provided only for scientific purposes";

/** Extrait badge / tests — dernière phrase de la citation. */
export const HTDEMUCS_MAINTAINER_QUOTE_EN = "only for scientific purposes";

export const HTDEMUCS_NOTICE_FR = `Poids HTDemucs : le mainteneur adefossez a écrit le 23 mai 2022 (Demucs #327) que les poids « ${HTDEMUCS_MAINTAINER_STATEMENT_EN} ». Lu le 2026-09-29. La fiche audio.cpp indique « MIT, usage commercial : oui » mais aucune source amont ne le confirme ; cette mention ne doit pas être lue comme la licence des poids. Le code d'audio.cpp v0.8.2 est sous Apache-2.0 (les poids gardent leur licence d'origine).`;

export const HTDEMUCS_6S_NOTICE_FR = `Même famille Demucs, licence des poids 6 stems non vérifiée. ${HTDEMUCS_NOTICE_FR}`;

/** Models deliberately excluded (no established redistributable license). */
export const EXCLUDED_SEPARATOR_NOTES_FR = [
  "BS-Roformer 6 stems (jarredou) — tous droits réservés : non proposé.",
  "Banquet / ADTOF — CC BY-NC-SA : écartés du socle (usage non commercial).",
] as const;

export const SEPARATOR_LICENSES: Record<StemProviderId, SeparatorLicenseInfo> = {
  htdemucs: {
    id: "htdemucs",
    status: "unverified",
    readDate: "2026-09-29",
    badgeFr: `usage scientifique (${HTDEMUCS_MAINTAINER_QUOTE_EN})`,
    noticeFr: HTDEMUCS_NOTICE_FR,
    sourceUrl: DEMUCS_327_ISSUE_URL,
    sourceLabelFr: "Demucs #327",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  htdemucs_6s: {
    id: "htdemucs_6s",
    status: "unverified",
    readDate: "2026-09-29",
    badgeFr: `usage scientifique (${HTDEMUCS_MAINTAINER_QUOTE_EN})`,
    noticeFr: HTDEMUCS_6S_NOTICE_FR,
    sourceUrl: DEMUCS_327_ISSUE_URL,
    sourceLabelFr: "Demucs #327",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  bs_roformer: {
    id: "bs_roformer",
    status: "unverified",
    readDate: "2026-09-29",
    badgeFr: "source du checkpoint non documentée",
    noticeFr:
      "BS-RoFormer ep368 (GGUF q8_0) : non vérifié. La fiche audio.cpp cite Apache-2.0, mais la source primaire du checkpoint n’est pas documentée — ne pas présenter comme vérifié. Opt-in hors installeur premier build.",
    sourceUrl:
      "https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/main/BS-RoFormer-ep368-GGUF",
    sourceLabelFr: "audio-cpp/audio.cpp-gguf · BS-RoFormer-ep368",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  mel_band_roformer: {
    id: "mel_band_roformer",
    status: "unverified",
    readDate: "2026-09-29",
    badgeFr: "source primaire absente",
    noticeFr:
      "Mel-Band RoFormer « Kim Vocal » (GGUF Q8) : non vérifié. Aucune source primaire de licence des poids n’a été confirmée ici ; les conversions tierces (ex. mlx-community) ne suffisent pas à afficher MIT ni commercialOk. Opt-in hors installeur. Les poids sous licence non commerciale (Banquet, ADTOF) restent écartés du socle.",
    sourceUrl:
      "https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/main/Mel-Band-RoFormer-GGUF",
    sourceLabelFr: "audio-cpp/audio.cpp-gguf · Mel-Band-RoFormer (poids GGUF)",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
};

export function separatorLicense(
  id: StemProviderId,
): SeparatorLicenseInfo | undefined {
  return SEPARATOR_LICENSES[id];
}

export function licenseStatusLabelFr(status: LicenseStatusKind): string {
  return LICENSE_STATUS_LABEL_FR[status];
}

export function licenseStatusIcon(status: LicenseStatusKind): string {
  return LICENSE_STATUS_ICON[status];
}

export function isNonCommercialStatus(status: LicenseStatusKind): boolean {
  return status === "non_commercial";
}

export function canDownloadSeparator(
  id: StemProviderId,
  accepted: Record<string, boolean> | undefined,
): boolean {
  const info = SEPARATOR_LICENSES[id];
  if (!info || !info.offered) return false;
  if (!info.requiresAcceptBeforeDownload) return true;
  return Boolean(accepted?.[id]);
}
