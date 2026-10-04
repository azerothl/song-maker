/** Honest house-model capability (#323). Never claims generation in-app. */

export const HOUSE_MODEL_ENGINE = "house_model";

export type HouseModelStatus = {
  available: boolean;
  generates: false;
  runtime: string;
  messageFr: string;
};

export const HOUSE_MODEL_UNAVAILABLE_FR =
  "Le modèle maison Song Maker n’est pas disponible : aucun poids, aucun décodeur desktop. " +
  "La recette d’entraînement (étape D jouet) est scripts/model-training/ — ce n’est pas une génération dans l’app. " +
  "YuE2 / ACE-Step restent les seuls moteurs.";

export function houseModelStatus(runtime?: string | null): HouseModelStatus {
  const runtimeId = (runtime ?? "unavailable").trim() || "unavailable";
  return {
    available: false,
    generates: false,
    runtime: runtimeId,
    messageFr: HOUSE_MODEL_UNAVAILABLE_FR,
  };
}

export function canSelectHouseModel(): boolean {
  return false;
}

export function canGenerateWithHouseModel(): boolean {
  return false;
}
