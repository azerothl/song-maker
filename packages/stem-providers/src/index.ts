export type {
  StemRole,
  StemReliability,
  StemAvailability,
  StemDescriptor,
  SeparationRequest,
  SeparationResult,
  StemSeparatorCapabilities,
  StemSeparatorProvider,
  AudiocppSepTransport,
} from "./types.js";
export {
  STEM_DISPLAY_NAMES,
  isCoreStemRole,
  reliabilityForRole,
  availabilityForRole,
} from "./types.js";
export {
  HTDEMUCS_PACKAGE,
  HTDEMUCS_CAPABILITIES,
  HtDemucsStemSeparator,
  createHtDemucsStemSeparator,
  mapHtDemucsStemIds,
} from "./htdemucs.js";
export {
  BS_ROFORMER_PACKAGE,
  BS_ROFORMER_CAPABILITIES,
  BsRoFormerStemSeparator,
  BsRoFormerStemSeparatorStub,
  createBsRoFormerStemSeparator,
  createBsRoFormerStemSeparatorStub,
  mapBsRoFormerStemIds,
} from "./bs-roformer.js";
export {
  HTDEMUCS_6S_PACKAGE,
  HTDEMUCS_6S_CAPABILITIES,
  HtDemucs6sStemSeparator,
  createHtDemucs6sStemSeparator,
  mapHtDemucs6sStemIds,
} from "./htdemucs-6s.js";
export {
  MEL_BAND_ROFORMER_PACKAGE,
  MEL_BAND_ROFORMER_CAPABILITIES,
  MelBandRoFormerStemSeparator,
  createMelBandRoFormerStemSeparator,
  mapMelBandRoFormerStemIds,
} from "./mel-band-roformer.js";
export type { StemProviderId, StemProviderConfig } from "./registry.js";
export {
  listStemProviderIds,
  createStemSeparator,
  isStemProviderRunnable,
  describeStemProvidersFr,
} from "./registry.js";
export type {
  SeparatorLicenseInfo,
  LicenseStatusKind,
} from "./licenses.js";
export {
  SEPARATOR_LICENSES,
  EXCLUDED_SEPARATOR_NOTES_FR,
  DEMUCS_327_ISSUE_URL,
  HTDEMUCS_MAINTAINER_QUOTE_EN,
  HTDEMUCS_MAINTAINER_STATEMENT_EN,
  HTDEMUCS_NOTICE_FR,
  HTDEMUCS_6S_NOTICE_FR,
  LICENSE_STATUS_LABEL_FR,
  LICENSE_STATUS_ICON,
  separatorLicense,
  licenseStatusLabelFr,
  licenseStatusIcon,
  isNonCommercialStatus,
  canDownloadSeparator,
} from "./licenses.js";
export type {
  SeparationTrackFocus,
  TimeKind,
  SeparatorTimeStat,
  QualityTimeOption,
} from "./recommend.js";
export {
  recommendSeparator,
  recommendReasonFr,
  recommendFocusReasonFr,
  unmeasuredRecommendationBadgeFr,
  unmeasuredRecommendationNoticeFr,
  formatDurationFr,
  timeLabelFr,
  buildQualityTimeOptions,
  mergeTimeStat,
} from "./recommend.js";
export type {
  EngineLicenseRow201,
  CommercialGrayReasonId,
  AppEngineCategory,
  AppEngineId,
  AppEngineDescriptor,
  WiredCommercialEngine,
  CommercialEngineListEntry,
  HobbyEngineOffer,
  CommercialCreationState,
  EngineContractTemplate,
} from "./engine-licenses-201.js";
export {
  ENGINE_LICENSE_ROWS_201,
  APP_ENGINE_CATALOG,
  licenseRowForEngine,
  licenseRowByDataId,
  listProductionWiredCommercialEngines,
  COMMERCIAL_RESERVED_STATUT_FR,
  COMMERCIAL_CREATION_UI_MODE,
  isCommercialProfileAvailable,
  isCommercialReservedStatut,
  licenseRowQualifiesForCommercialReserved,
  primarySourceUrlForLicenseRow,
  hasDatedLicenseEntry,
  resolveCommercialCreationState,
  buildCommercialEngineList,
  buildHobbyEngineOffers,
  hobbyUsageNoticeFr,
  HOBBY_NON_COMMERCIAL_USAGE_FR,
  sha256HexUtf8,
  engineContractFingerprint,
} from "./engine-licenses-201.js";
export {
  extractPrimaryLicenseSourceUrl,
  isValidLicenseHref,
} from "./license-source-url.js";
export { COMMERCIAL_COPY_FORBIDDEN } from "./commercial-copy-forbidden.js";
export type { ReservedStatusTemplate } from "./commercial-profile-i18n.js";
export type { CommercialProfileCreationConfirm } from "./commercial-creation-confirm.js";
export {
  buildCommercialProfileCreationConfirm,
  formatCommercialCreationEngineLineFr,
  COMMERCIAL_CREATE_CONFIRM_TITLE_FR,
  COMMERCIAL_CREATE_CONFIRM_INTRO_FR,
} from "./commercial-creation-confirm.js";
export {
  COMMERCIAL_PROFILE_DESCRIPTION_FR,
  COMMERCIAL_PROFILE_DESCRIPTION_EN,
  COMMERCIAL_CREATION_DISABLED_REASON_FR,
  COMMERCIAL_CREATION_DISABLED_REASON_EN,
  COMMERCIAL_GRAY_SECTION_TITLE_FR,
  COMMERCIAL_GRAY_SECTION_TITLE_EN,
  COMMERCIAL_GRAY_REASONS_FR,
  COMMERCIAL_GRAY_REASONS_EN,
  RESERVED_BADGE_FR,
  RESERVED_BADGE_EN,
  formatReservedStatusLineFr,
  formatReservedStatusLineEn,
  ENGINE_CONTRACT_TITLE_FR,
  ENGINE_CONTRACT_TITLE_EN,
  ENGINE_CONTRACT_BODY_FR,
  ENGINE_CONTRACT_BODY_EN,
  ENGINE_CONTRACT_CHECKBOX_FR,
  ENGINE_CONTRACT_CHECKBOX_EN,
} from "./commercial-profile-i18n.js";
