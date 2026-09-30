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
