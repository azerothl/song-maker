import { engineContractFingerprint } from "./engine-licenses-201.js";

export const ACE_STEP_ENGINE_ID = "ace_step_1_5";
export const ACE_STEP_CONTRACT_VERSION = "2026-10-01-v1";

export const ACE_STEP_CONTRACT_TITLE_FR = "Avant d'utiliser ACE-Step dans ce profil";
export const ACE_STEP_CONTRACT_TITLE_EN = "Before using ACE-Step in this profile";
export const ACE_STEP_CONTRACT_BODY_FR =
  "Licence des poids : MIT selon la carte du modèle d'origine ; la conversion distribuée par audio.cpp déclare \"other\" et renvoie à l'original ; sortie non vérifiée. Song Maker n'a pas vérifié les droits d'usage commercial des poids ACE-Step ni des morceaux générés. Les auteurs formulent cet avertissement :";
export const ACE_STEP_CONTRACT_BODY_EN =
  "Weight license: MIT according to the original model card; the conversion distributed by audio.cpp declares \"other\" and points back to the original; output rights are unverified. Song Maker has not verified commercial rights for ACE-Step weights or generated tracks. The authors publish this notice:";
export const ACE_STEP_CONTRACT_QUOTE_EN =
  "The authors are not responsible for any misuse of the model";
export const ACE_STEP_CONTRACT_CHECKBOX_FR =
  "J’ai lu l’avertissement des auteurs et je l’accepte pour ce profil.";
export const ACE_STEP_CONTRACT_CHECKBOX_EN =
  "I have read the authors’ notice and accept it for this profile.";

export function aceStepContractFingerprint(): Promise<string> {
  return engineContractFingerprint({
    engineId: ACE_STEP_ENGINE_ID,
    titleFr: ACE_STEP_CONTRACT_TITLE_FR,
    titleEn: ACE_STEP_CONTRACT_TITLE_EN,
    bodyFr: ACE_STEP_CONTRACT_BODY_FR,
    bodyEn: ACE_STEP_CONTRACT_BODY_EN,
    quoteEn: ACE_STEP_CONTRACT_QUOTE_EN,
    checkboxFr: ACE_STEP_CONTRACT_CHECKBOX_FR,
    checkboxEn: ACE_STEP_CONTRACT_CHECKBOX_EN,
    version: ACE_STEP_CONTRACT_VERSION,
  });
}
