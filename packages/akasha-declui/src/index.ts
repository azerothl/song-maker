export type {
  MusicApiCapability,
  MusicApiDescriptor,
  DeclUiSurfaceId,
  DeclUiSurface,
  AkashaHostRegistration,
  AkashaHostBridge,
  HostModeState,
  HostModeResult,
} from "./host.js";
export {
  MUSIC_API_DESCRIPTOR,
  DECL_UI_SURFACES,
  AKASHA_HOST_REGISTRATION,
  DesktopFirstAkashaHostBridge,
  StubAkashaHostBridge,
  createAkashaHostBridge,
  getSharedAkashaHostBridge,
  resetSharedAkashaHostBridge,
} from "./host.js";
