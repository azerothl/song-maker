import type { StemProviderId } from "./registry.js";

/**
 * Licence metadata for separator weights (#167).
 * Not legal advice — labels follow audio.cpp model_licenses + issue notes.
 * NC weights (Banquet, ADTOF, jarredou 6 stems all-rights) stay out of this catalog.
 */
export type SeparatorLicenseInfo = {
  id: StemProviderId;
  /** Short badge text shown in UI. */
  badgeFr: string;
  /** Full notice before download. */
  noticeFr: string;
  sourceUrl: string;
  sourceLabelFr: string;
  /** True when commercial redistribution of weights is clearly allowed. */
  commercialOk: boolean;
  /** Non-commercial restriction badge. */
  nonCommercial: boolean;
  /** Weights may be downloaded / offered in the product. */
  offered: boolean;
  /** Requires explicit « J'ai lu la licence » before download. */
  requiresAcceptBeforeDownload: boolean;
};

const MODEL_LICENSES_DOC =
  "https://github.com/0xShug0/audio.cpp/blob/main/docs/model_licenses.md";

export const SEPARATOR_LICENSES: Record<StemProviderId, SeparatorLicenseInfo> = {
  htdemucs: {
    id: "htdemucs",
    badgeFr: "MIT (fiche) — non vérifié après 2022",
    noticeFr:
      "Poids HTDemucs : la fiche audio.cpp indique MIT (facebookresearch/demucs), mais la licence des poids après 2022 n’est pas vérifiée ici (Demucs #327 évoque un usage scientifique). Ne pas présenter comme libre sans contrôle. Code audio.cpp = Apache-2.0 (ne couvre pas les poids).",
    sourceUrl: "https://github.com/facebookresearch/demucs",
    sourceLabelFr: "facebookresearch/demucs",
    commercialOk: false,
    nonCommercial: false,
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  htdemucs_6s: {
    id: "htdemucs_6s",
    badgeFr: "MIT (fiche) — non vérifié après 2022",
    noticeFr:
      "Runtime / poids HTDemucs 6 stems (ONNX) : même famille Demucs — MIT sur la fiche audio.cpp, non vérifié après 2022. Hors chemin audio.cpp GGUF. Le BS-Roformer 6 stems de jarredou (tous droits réservés) n’est pas proposé.",
    sourceUrl: MODEL_LICENSES_DOC,
    sourceLabelFr: "audio.cpp model_licenses (htdemucs_6stems)",
    commercialOk: false,
    nonCommercial: false,
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  bs_roformer: {
    id: "bs_roformer",
    badgeFr: "Apache-2.0, source du checkpoint non documentée",
    noticeFr:
      "BS-RoFormer ep368 (GGUF q8_0) : Apache-2.0 selon la fiche audio.cpp, mais la source du checkpoint n’est pas documentée — ne pas présenter comme vérifié. Opt-in hors installeur premier build.",
    sourceUrl:
      "https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/main/BS-RoFormer-ep368-GGUF",
    sourceLabelFr: "audio-cpp/audio.cpp-gguf · BS-RoFormer-ep368",
    commercialOk: false,
    nonCommercial: false,
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
  mel_band_roformer: {
    id: "mel_band_roformer",
    badgeFr: "MIT",
    noticeFr:
      "Mel-Band RoFormer « Kim Vocal 2 » (GGUF Q8) : MIT selon audio.cpp model_licenses (mlx-community/mel-roformer-mlx). Opt-in hors installeur. Les poids sous licence non commerciale (Banquet, ADTOF) restent écartés du socle.",
    sourceUrl: "https://huggingface.co/mlx-community/mel-roformer-mlx",
    sourceLabelFr: "mlx-community/mel-roformer-mlx",
    commercialOk: true,
    nonCommercial: false,
    offered: true,
    requiresAcceptBeforeDownload: true,
  },
};

/** Models deliberately excluded (no established redistributable license). */
export const EXCLUDED_SEPARATOR_NOTES_FR = [
  "BS-Roformer 6 stems (jarredou) — tous droits réservés : non proposé.",
  "Banquet / ADTOF — CC BY-NC-SA : écartés du socle.",
] as const;

export function separatorLicense(
  id: StemProviderId,
): SeparatorLicenseInfo | undefined {
  return SEPARATOR_LICENSES[id];
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
