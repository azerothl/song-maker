/**
 * Akasha host + DeclUI surface — phase 4 (§18.5).
 * Desktop-first remains the product default. Host mode is opt-in from Settings.
 * Piano roll is phase 2, not this host contract.
 */

export type MusicApiCapability =
  | "generate_yue2"
  | "separate_stems"
  | "export_mix"
  | "list_projects"
  | "apply_style_lora";

/** Music API distinct from any TTS surface on the same host. */
export type MusicApiDescriptor = {
  id: "song-maker-music";
  version: 1;
  /** Explicitly not a speech/TTS API. */
  kind: "music";
  capabilities: readonly MusicApiCapability[];
};

export const MUSIC_API_DESCRIPTOR: MusicApiDescriptor = {
  id: "song-maker-music",
  version: 1,
  kind: "music",
  capabilities: [
    "generate_yue2",
    "separate_stems",
    "export_mix",
    "list_projects",
    "apply_style_lora",
  ],
};

export type DeclUiSurfaceId =
  | "library"
  | "song_form"
  | "mix_transport"
  | "licenses"
  | "agent_panel";

export type DeclUiSurface = {
  id: DeclUiSurfaceId;
  /** DeclUI declaration id placeholder. */
  declaration: string;
  /** Phase that owns the real UI. */
  ownedByPhase: 1 | 2 | 3 | 4;
};

export const DECL_UI_SURFACES: readonly DeclUiSurface[] = [
  {
    id: "library",
    declaration: "songmaker.library.v1",
    ownedByPhase: 1,
  },
  {
    id: "song_form",
    declaration: "songmaker.song_form.v1",
    ownedByPhase: 1,
  },
  {
    id: "mix_transport",
    declaration: "songmaker.mix_transport.v1",
    ownedByPhase: 1,
  },
  {
    id: "licenses",
    declaration: "songmaker.licenses.v1",
    ownedByPhase: 1,
  },
  {
    id: "agent_panel",
    declaration: "songmaker.agent_panel.v1",
    ownedByPhase: 4,
  },
] as const;

export type AkashaHostRegistration = {
  hostId: "akasha";
  musicApi: MusicApiDescriptor;
  declUiSurfaces: readonly DeclUiSurface[];
  /** Pack catalog is phase 4 (§23) — wired via @song-maker/lora-packs. */
  packCatalogPackage: "@song-maker/lora-packs";
};

export const AKASHA_HOST_REGISTRATION: AkashaHostRegistration = {
  hostId: "akasha",
  musicApi: MUSIC_API_DESCRIPTOR,
  declUiSurfaces: DECL_UI_SURFACES,
  packCatalogPackage: "@song-maker/lora-packs",
};

export type HostModeState = "desktop" | "host_adapter";

export type HostModeResult = {
  ok: boolean;
  mode: HostModeState;
  /** French status for Settings « mode hôte ». */
  messageFr: string;
  registration: AkashaHostRegistration;
};

/**
 * Smallest callable adapter from Settings « mode hôte ».
 * Does not start a network host; keeps desktop-first as default.
 */
export interface AkashaHostBridge {
  describe(): AkashaHostRegistration;
  /** Current mode — always starts as desktop. */
  getMode(): HostModeState;
  /**
   * Opt-in host adapter. Safe to call from Settings.
   * Does not break desktop generation; no SheetSage2; no installer change.
   */
  enableHostMode(): Promise<HostModeResult>;
  /** Return to desktop-only (product default). */
  disableHostMode(): HostModeResult;
  /**
   * @deprecated Use enableHostMode(). Kept for callers that expected throw-on-register.
   */
  register(): Promise<void>;
}

export class DesktopFirstAkashaHostBridge implements AkashaHostBridge {
  private mode: HostModeState = "desktop";

  describe(): AkashaHostRegistration {
    return AKASHA_HOST_REGISTRATION;
  }

  getMode(): HostModeState {
    return this.mode;
  }

  async enableHostMode(): Promise<HostModeResult> {
    this.mode = "host_adapter";
    return {
      ok: true,
      mode: this.mode,
      messageFr:
        "Mode hôte (adaptateur) activé localement. " +
        "API musique `song-maker-music` exposée pour découverte DeclUI — " +
        "pas de processus Akasha distant, desktop reste le chemin de génération. " +
        "Voir packages/akasha-declui/docs/integration-notes.md.",
      registration: AKASHA_HOST_REGISTRATION,
    };
  }

  disableHostMode(): HostModeResult {
    this.mode = "desktop";
    return {
      ok: true,
      mode: "desktop",
      messageFr:
        "Mode desktop local (défaut). Aucune intégration hôte active.",
      registration: AKASHA_HOST_REGISTRATION,
    };
  }

  async register(): Promise<void> {
    await this.enableHostMode();
  }
}

/** @deprecated Prefer DesktopFirstAkashaHostBridge. */
export class StubAkashaHostBridge extends DesktopFirstAkashaHostBridge {}

let sharedBridge: DesktopFirstAkashaHostBridge | null = null;

export function createAkashaHostBridge(): DesktopFirstAkashaHostBridge {
  return new DesktopFirstAkashaHostBridge();
}

/** Singleton for Settings UI — one adapter per app session. */
export function getSharedAkashaHostBridge(): DesktopFirstAkashaHostBridge {
  if (!sharedBridge) {
    sharedBridge = createAkashaHostBridge();
  }
  return sharedBridge;
}

/** Test helper. */
export function resetSharedAkashaHostBridge(): void {
  sharedBridge = null;
}
