import type { CommercialGrayReasonId } from "./engine-licenses-201.js";

/** Reserved-badge line template (per engine data when wired). */
export type ReservedStatusTemplate = {
  weightLicenseLabel: string;
  conversionLicenseLabel: string;
  outputVerified: boolean;
};

export const COMMERCIAL_PROFILE_DESCRIPTION_FR =
  "Pour les projets destinés à être diffusés ou vendus. Seuls les moteurs proposés avec réserve le sont ici, avec les réserves indiquées dans les licences des poids.";

export const COMMERCIAL_PROFILE_DESCRIPTION_EN =
  "For projects you intend to publish or sell. Only engines offered here with reservation are listed, with the reservations stated in the weight licenses.";

export const COMMERCIAL_CREATION_DISABLED_REASON_FR =
  "Indisponible pour l'instant : aucun moteur de Song Maker n'a une licence des poids vérifiée pour l'usage commercial.";

export const COMMERCIAL_CREATION_DISABLED_REASON_EN =
  "Unavailable for now: no Song Maker engine has a verified weight license for commercial use.";

export const COMMERCIAL_GRAY_SECTION_TITLE_FR =
  "Moteurs non proposés dans ce profil";

export const COMMERCIAL_GRAY_SECTION_TITLE_EN =
  "Engines not offered in this profile";

export const COMMERCIAL_GRAY_REASONS_FR: Record<CommercialGrayReasonId, string> = {
  non_commercial: "Usage non commercial uniquement.",
  weights_unverified:
    "Licence des poids non vérifiée : aucune source fiable ne confirme l'usage commercial.",
  origin_undocumented:
    "Origine des poids non documentée : le lien avec les poids d'origine n'est pas établi.",
};

export const COMMERCIAL_GRAY_REASONS_EN: Record<CommercialGrayReasonId, string> = {
  non_commercial: "Non-commercial use only.",
  weights_unverified:
    "Weight license unverified: no reliable source confirms commercial use.",
  origin_undocumented:
    "Undocumented weight origin: the link to the original weights is not established.",
};

export function formatReservedStatusLineFr(t: ReservedStatusTemplate): string {
  const conv = t.conversionLicenseLabel
    ? ` ; la conversion distribuée par audio.cpp déclare « ${t.conversionLicenseLabel} » et renvoie à l'original`
    : "";
  const out = t.outputVerified ? "" : " ; sortie non vérifiée";
  return `Licence des poids : ${t.weightLicenseLabel} selon la carte du modèle d'origine${conv}${out}.`;
}

export function formatReservedStatusLineEn(t: ReservedStatusTemplate): string {
  const conv = t.conversionLicenseLabel
    ? `; the audio.cpp distributed conversion declares "${t.conversionLicenseLabel}" and points to the original`
    : "";
  const out = t.outputVerified ? "" : "; output unverified";
  return `Weight license: ${t.weightLicenseLabel} per the original model card${conv}${out}.`;
}

export const ENGINE_CONTRACT_TITLE_FR =
  "Avant d'utiliser {engineName} dans ce profil";

export const ENGINE_CONTRACT_TITLE_EN =
  "Before using {engineName} in this profile";

export const ENGINE_CONTRACT_BODY_FR =
  "Song Maker n'a pas pu vérifier que les morceaux produits par {engineName} peuvent être vendus ou diffusés sans restriction. Les auteurs du modèle publient eux-mêmes un avertissement : [citation ci-dessous]. Vous restez responsable de l'usage que vous faites des morceaux générés.";

export const ENGINE_CONTRACT_BODY_EN =
  "Song Maker could not verify that tracks produced by {engineName} can be sold or distributed without restriction. The model authors publish their own notice: [quote below]. You remain responsible for how you use generated tracks.";

export const ENGINE_CONTRACT_CHECKBOX_FR =
  "J'ai lu cet avertissement et je l'accepte pour ce profil.";

export const ENGINE_CONTRACT_CHECKBOX_EN =
  "I have read this notice and accept it for this profile.";
