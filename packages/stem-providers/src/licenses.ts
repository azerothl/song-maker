import type { StemProviderId } from "./registry.js";

/** Statut de licence affiché avant tout téléchargement (#167). */
export type SeparatorLicenseStatus =
  | "verified"
  | "unverified"
  | "non_commercial"
  | "excluded";

/**
 * Licence metadata for separator weights (#167).
 * Not legal advice — labels follow audio.cpp model_licenses + issue notes.
 */
export type SeparatorLicenseInfo = {
  id: StemProviderId;
  status: SeparatorLicenseStatus;
  /** Short badge text shown in UI (with icon). */
  badgeFr: string;
  /** Full notice before download. */
  noticeFr: string;
  /** Lien affiché dans l’UI (peut être une fiche projet, pas toujours la source primaire des poids). */
  sourceUrl: string;
  sourceLabelFr: string;
  /**
   * Source primaire des poids + date de lecture — obligatoire si `status === "verified"`.
   */
  primarySourceUrl?: string;
  primarySourceReadAt?: string;
  /** Weights may be downloaded / offered in the product. */
  offered: boolean;
  /** Requires explicit « J'ai lu la licence » before download. */
  requiresAcceptBeforeDownload: boolean;
};

const MODEL_LICENSES_DOC =
  "https://github.com/0xShug0/audio.cpp/blob/main/docs/model_licenses.md";

const HTDEMUCS_MAINTAINER_QUOTE_FR =
  "Les poids seraient « only for scientific purposes » (adefossez, décembre 2022 — voir facebookresearch/demucs#327). La fiche Hugging Face actuelle des poids convertis ne comporte pas de licence claire.";

const HTDEMUCS_NOTICE_FR = `Poids HTDemucs (GGUF) : ${HTDEMUCS_MAINTAINER_QUOTE_FR} Ne pas présenter comme libre de droits sans contrôle juridique. Le code audio.cpp est Apache-2.0 (ne couvre pas les poids).`;

export const SEPARATOR_LICENSES: Record<StemProviderId, SeparatorLicenseInfo> = {
  htdemucs: {
    id: "htdemucs",
    status: "unverified",
    badgeFr: "Non vérifié",
    noticeFr: HTDEMUCS_NOTICE_FR,
    sourceUrl: "https://github.com/facebookresearch/demucs/issues/327",
    sourceLabelFr: "facebookresearch/demucs#327 (citation 2022)",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  htdemucs_6s: {
    id: "htdemucs_6s",
    status: "unverified",
    badgeFr: "Non vérifié",
    noticeFr: `Runtime / poids HTDemucs 6 stems (ONNX) : même famille Demucs — ${HTDEMUCS_MAINTAINER_QUOTE_FR} Hors chemin audio.cpp GGUF.`,
    sourceUrl: MODEL_LICENSES_DOC,
    sourceLabelFr: "audio.cpp model_licenses (htdemucs_6stems)",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  bs_roformer: {
    id: "bs_roformer",
    status: "unverified",
    badgeFr: "Non vérifié",
    noticeFr:
      "BS-RoFormer ep368 (GGUF q8_0) : Apache-2.0 selon la fiche audio.cpp, mais la source du checkpoint d’entraînement n’est pas documentée — ne pas présenter comme vérifié. Opt-in hors installeur premier build.",
    sourceUrl: MODEL_LICENSES_DOC,
    sourceLabelFr: "audio.cpp model_licenses (BS-RoFormer-ep368)",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  mel_band_roformer: {
    id: "mel_band_roformer",
    status: "unverified",
    badgeFr: "Non vérifié",
    noticeFr:
      "Mel-Band RoFormer « Kim Vocal 2 » (GGUF Q8) : MIT indiqué sur la fiche audio.cpp pour mlx-community/mel-roformer-mlx, mais la chaîne de conversion des poids n’est pas vérifiée ici — ne pas présenter comme vérifié. Opt-in hors installeur.",
    sourceUrl: MODEL_LICENSES_DOC,
    sourceLabelFr: "audio.cpp model_licenses (Kim Vocal 2)",
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
};

/** Modèles exclus du catalogue téléchargeable (explications affichées dans l’UI). */
export const EXCLUDED_SEPARATOR_NOTES_FR = [
  "BS-Roformer 6 stems (jarredou) — tous droits réservés : non proposé dans Song Maker.",
  "Poids CC BY-NC (Banquet, ADTOF, jarredou 6 stems) — écartés du socle de séparation.",
] as const;

export function separatorLicense(
  id: StemProviderId,
): SeparatorLicenseInfo | undefined {
  return SEPARATOR_LICENSES[id];
}

export function licenseStatusLabelFr(status: SeparatorLicenseStatus): string {
  switch (status) {
    case "verified":
      return "Vérifié";
    case "unverified":
      return "Non vérifié";
    case "non_commercial":
      return "Usage non commercial";
    case "excluded":
      return "Exclu";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Icône textuelle affichée à côté du libellé (accessibilité : doublée par le texte). */
export function licenseStatusIcon(status: SeparatorLicenseStatus): string {
  switch (status) {
    case "verified":
      return "✓";
    case "unverified":
      return "⚠";
    case "non_commercial":
      return "ⓘ";
    case "excluded":
      return "⊘";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function assertVerifiedLicenseShape(info: SeparatorLicenseInfo): void {
  if (info.status !== "verified") return;
  if (!info.primarySourceUrl || !info.primarySourceReadAt) {
    throw new Error(
      `Licence « vérifiée » pour ${info.id} : source primaire et date de lecture requises.`,
    );
  }
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
