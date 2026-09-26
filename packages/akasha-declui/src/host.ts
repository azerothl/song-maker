/**
 * Akasha host + DeclUI surface — phase 4 (§18.5).
 * First build does not ship these. Piano roll is phase 2, not this host contract.
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

/**
 * Placeholder bridge — no network, no host process.
 */
export interface AkashaHostBridge {
  describe(): AkashaHostRegistration;
  /**
   * Register Song Maker music API with an Akasha host.
   * Stub throws until phase 4 wiring exists.
   */
  register(): Promise<void>;
}

export class StubAkashaHostBridge implements AkashaHostBridge {
  describe(): AkashaHostRegistration {
    return AKASHA_HOST_REGISTRATION;
  }

  async register(): Promise<void> {
    throw new Error(
      "Akasha/DeclUI registration is a phase-4 stub (§18.5). First build is desktop-only.",
    );
  }
}

export function createAkashaHostBridge(): AkashaHostBridge {
  return new StubAkashaHostBridge();
}
