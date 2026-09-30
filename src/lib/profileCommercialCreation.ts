import {
  COMMERCIAL_CREATION_DISABLED_REASON_EN,
  COMMERCIAL_CREATION_DISABLED_REASON_FR,
  resolveCommercialCreationState,
  type CommercialCreationState,
  type WiredCommercialEngine,
} from "@song-maker/stem-providers";

export {
  resolveCommercialCreationState,
  isCommercialProfileAvailable,
  listProductionWiredCommercialEngines,
  COMMERCIAL_CREATION_UI_MODE,
};
export type { CommercialCreationState, WiredCommercialEngine };

export function commercialUnavailableReasonFr(): string {
  return COMMERCIAL_CREATION_DISABLED_REASON_FR;
}

export function commercialUnavailableReasonEn(): string {
  return COMMERCIAL_CREATION_DISABLED_REASON_EN;
}
