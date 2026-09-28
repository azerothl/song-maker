/**
 * Akasha host + DeclUI surface — phase 4 (§18.5 / #66).
 * Desktop-first remains the product default. Host mode is opt-in from Settings.
 * Without a reachable Akasha host, mode is clearly « unavailable » — never a fake connected state.
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
  /** DeclUI declaration id. */
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
  apiVersion: "song-maker.host.v1";
};

export const AKASHA_HOST_REGISTRATION: AkashaHostRegistration = {
  hostId: "akasha",
  musicApi: MUSIC_API_DESCRIPTOR,
  declUiSurfaces: DECL_UI_SURFACES,
  packCatalogPackage: "@song-maker/lora-packs",
  apiVersion: "song-maker.host.v1",
};

/** Product host modes — never present a fake « connected » without a real host. */
export type HostModeState = "desktop" | "connected" | "unavailable";

export type HostModeResult = {
  ok: boolean;
  mode: HostModeState;
  /** French status for Settings « mode hôte ». */
  messageFr: string;
  registration: AkashaHostRegistration;
  hostUrl: string | null;
  /** Typed error code when discovery / invoke fails. */
  errorCode?: AkashaHostErrorCode;
};

export type AkashaHostErrorCode =
  | "host_url_missing"
  | "host_unreachable"
  | "auth_rejected"
  | "api_version_mismatch"
  | "capability_denied"
  | "capability_unknown"
  | "not_connected"
  | "network_opt_out";

export type MusicCapabilityInvokeRequest = {
  capability: MusicApiCapability;
  /** JSON-schema-shaped args (validated lightly client-side). */
  args: Record<string, unknown>;
  /** Permission token from the host session, if any. */
  permissionToken?: string | null;
};

export type MusicCapabilityInvokeResult =
  | {
      ok: true;
      capability: MusicApiCapability;
      result: unknown;
    }
  | {
      ok: false;
      capability: MusicApiCapability;
      errorCode: AkashaHostErrorCode;
      messageFr: string;
    };

export const AKASHA_HOST_URL_ENV = "SONG_MAKER_AKASHA_HOST_URL";
export const AKASHA_HOST_TOKEN_ENV = "SONG_MAKER_AKASHA_HOST_TOKEN";

export type AkashaHostPreferences = {
  /** Opt-in: attempt network discovery. Default false → zero network. */
  hostOptIn: boolean;
  hostUrl: string;
  accessToken: string | null;
};

export const DEFAULT_AKASHA_HOST_PREFERENCES: AkashaHostPreferences = {
  hostOptIn: false,
  hostUrl: "",
  accessToken: null,
};

export type AkashaDiscoveryResponse = {
  apiVersion: string;
  hostId: string;
  musicApi?: { id?: string; kind?: string; version?: number };
  declUiSurfaces?: unknown[];
};

export interface AkashaHostTransport {
  discover(
    hostUrl: string,
    token: string | null,
  ): Promise<
    | { ok: true; body: AkashaDiscoveryResponse }
    | { ok: false; errorCode: AkashaHostErrorCode; messageFr: string }
  >;
  invoke(
    hostUrl: string,
    token: string | null,
    request: MusicCapabilityInvokeRequest,
  ): Promise<MusicCapabilityInvokeResult>;
}

/**
 * HTTP transport for a real Akasha/DeclUI host implementing
 * packages/akasha-declui/docs/host-protocol.md.
 */
export class FetchAkashaHostTransport implements AkashaHostTransport {
  async discover(
    hostUrl: string,
    token: string | null,
  ): Promise<
    | { ok: true; body: AkashaDiscoveryResponse }
    | { ok: false; errorCode: AkashaHostErrorCode; messageFr: string }
  > {
    try {
      const url = new URL("/v1/host/discover", hostUrl.replace(/\/?$/, "/"));
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { method: "GET", headers });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          errorCode: "auth_rejected",
          messageFr: "Authentification hôte refusée.",
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          errorCode: "host_unreachable",
          messageFr: `Découverte hôte HTTP ${res.status}.`,
        };
      }
      const body = (await res.json()) as AkashaDiscoveryResponse;
      return { ok: true, body };
    } catch (e) {
      return {
        ok: false,
        errorCode: "host_unreachable",
        messageFr: `Hôte injoignable (${e instanceof Error ? e.message : String(e)}).`,
      };
    }
  }

  async invoke(
    hostUrl: string,
    token: string | null,
    request: MusicCapabilityInvokeRequest,
  ): Promise<MusicCapabilityInvokeResult> {
    try {
      const url = new URL("/v1/host/invoke", hostUrl.replace(/\/?$/, "/"));
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        result?: unknown;
        errorCode?: AkashaHostErrorCode;
        messageFr?: string;
      } | null;
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          capability: request.capability,
          errorCode: "auth_rejected",
          messageFr: json?.messageFr ?? "Permission hôte refusée.",
        };
      }
      if (!res.ok || !json?.ok) {
        return {
          ok: false,
          capability: request.capability,
          errorCode: json?.errorCode ?? "capability_denied",
          messageFr:
            json?.messageFr ??
            `Invocation HTTP ${res.status} — capacité non exécutée.`,
        };
      }
      return {
        ok: true,
        capability: request.capability,
        result: json.result ?? null,
      };
    } catch (e) {
      return {
        ok: false,
        capability: request.capability,
        errorCode: "host_unreachable",
        messageFr: `Invocation injoignable (${e instanceof Error ? e.message : String(e)}).`,
      };
    }
  }
}

function readEnv(name: string): string | null {
  try {
    if (typeof process !== "undefined" && process.env?.[name]) {
      return process.env[name]!.trim() || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveAkashaHostPreferences(
  partial?: Partial<AkashaHostPreferences>,
): AkashaHostPreferences {
  const fromEnvUrl = readEnv(AKASHA_HOST_URL_ENV);
  const fromEnvToken = readEnv(AKASHA_HOST_TOKEN_ENV);
  return {
    hostOptIn: partial?.hostOptIn ?? false,
    hostUrl: (partial?.hostUrl ?? fromEnvUrl ?? "").trim(),
    accessToken: partial?.accessToken ?? fromEnvToken,
  };
}

/**
 * Callable adapter from Settings « mode hôte ».
 * Desktop remains independent; network only after explicit opt-in + host URL.
 */
export interface AkashaHostBridge {
  describe(): AkashaHostRegistration;
  getMode(): HostModeState;
  getHostUrl(): string | null;
  /**
   * Opt-in discovery against a real Akasha host.
   * Without URL / unreachable host → mode `unavailable` (not a fake activation).
   */
  enableHostMode(
    preferences?: Partial<AkashaHostPreferences>,
  ): Promise<HostModeResult>;
  /** Return to desktop-only (product default). Clears session. */
  disableHostMode(): HostModeResult;
  /** Re-run discovery after disconnect / network loss. */
  resumeHostMode(): Promise<HostModeResult>;
  invokeMusicCapability(
    request: MusicCapabilityInvokeRequest,
  ): Promise<MusicCapabilityInvokeResult>;
  /**
   * @deprecated Use enableHostMode(). Kept for callers that expected throw-on-register.
   */
  register(): Promise<void>;
}

export type DesktopFirstAkashaHostBridgeOptions = {
  transport?: AkashaHostTransport;
  preferences?: Partial<AkashaHostPreferences>;
};

export class DesktopFirstAkashaHostBridge implements AkashaHostBridge {
  private mode: HostModeState = "desktop";
  private hostUrl: string | null = null;
  private preferences: AkashaHostPreferences;
  private readonly transport: AkashaHostTransport;

  constructor(options: DesktopFirstAkashaHostBridgeOptions = {}) {
    this.transport = options.transport ?? new FetchAkashaHostTransport();
    this.preferences = resolveAkashaHostPreferences(options.preferences);
  }

  describe(): AkashaHostRegistration {
    return AKASHA_HOST_REGISTRATION;
  }

  getMode(): HostModeState {
    return this.mode;
  }

  getHostUrl(): string | null {
    return this.hostUrl;
  }

  async enableHostMode(
    preferences?: Partial<AkashaHostPreferences>,
  ): Promise<HostModeResult> {
    if (preferences) {
      this.preferences = resolveAkashaHostPreferences({
        ...this.preferences,
        ...preferences,
      });
    }
    if (!this.preferences.hostOptIn) {
      this.mode = "desktop";
      this.hostUrl = null;
      return {
        ok: false,
        mode: "desktop",
        hostUrl: null,
        messageFr:
          "Mode desktop local (défaut). Aucune intégration hôte active — opt-in requis.",
        registration: AKASHA_HOST_REGISTRATION,
        errorCode: "network_opt_out",
      };
    }
    const url = this.preferences.hostUrl.trim();
    if (!url) {
      this.mode = "unavailable";
      this.hostUrl = null;
      return {
        ok: false,
        mode: "unavailable",
        hostUrl: null,
        messageFr:
          "Intégration Akasha / DeclUI indisponible : aucune URL d’hôte. " +
          "Adaptateur local seulement — pas de connexion. " +
          `Définir ${AKASHA_HOST_URL_ENV} ou saisir l’URL dans Paramètres.`,
        registration: AKASHA_HOST_REGISTRATION,
        errorCode: "host_url_missing",
      };
    }

    const discovered = await this.transport.discover(
      url,
      this.preferences.accessToken,
    );
    if (!discovered.ok) {
      this.mode = "unavailable";
      this.hostUrl = null;
      return {
        ok: false,
        mode: "unavailable",
        hostUrl: null,
        messageFr:
          `Intégration indisponible — ${discovered.messageFr} ` +
          "Le desktop local reste le chemin de génération.",
        registration: AKASHA_HOST_REGISTRATION,
        errorCode: discovered.errorCode,
      };
    }

    if (discovered.body.apiVersion !== AKASHA_HOST_REGISTRATION.apiVersion) {
      this.mode = "unavailable";
      this.hostUrl = null;
      return {
        ok: false,
        mode: "unavailable",
        hostUrl: null,
        messageFr:
          `Version d’API hôte incompatible (${discovered.body.apiVersion}). ` +
          `Attendu ${AKASHA_HOST_REGISTRATION.apiVersion}.`,
        registration: AKASHA_HOST_REGISTRATION,
        errorCode: "api_version_mismatch",
      };
    }
    if (
      discovered.body.musicApi?.kind !== "music" ||
      discovered.body.musicApi?.id !== "song-maker-music"
    ) {
      this.mode = "unavailable";
      this.hostUrl = null;
      return {
        ok: false,
        mode: "unavailable",
        hostUrl: null,
        messageFr:
          "L’hôte n’expose pas l’API musique `song-maker-music` (distincte du TTS).",
        registration: AKASHA_HOST_REGISTRATION,
        errorCode: "capability_denied",
      };
    }

    this.mode = "connected";
    this.hostUrl = url;
    return {
      ok: true,
      mode: "connected",
      hostUrl: url,
      messageFr:
        `Connecté à l’hôte Akasha (${url}). ` +
        "API musique et surfaces DeclUI découvertes. " +
        "Le mode desktop local reste disponible à la déconnexion.",
      registration: AKASHA_HOST_REGISTRATION,
    };
  }

  disableHostMode(): HostModeResult {
    this.mode = "desktop";
    this.hostUrl = null;
    this.preferences = {
      ...this.preferences,
      hostOptIn: false,
    };
    return {
      ok: true,
      mode: "desktop",
      hostUrl: null,
      messageFr:
        "Mode desktop local (défaut). Aucune intégration hôte active.",
      registration: AKASHA_HOST_REGISTRATION,
    };
  }

  async resumeHostMode(): Promise<HostModeResult> {
    if (!this.preferences.hostOptIn) {
      return this.disableHostMode();
    }
    return this.enableHostMode({ hostOptIn: true });
  }

  async invokeMusicCapability(
    request: MusicCapabilityInvokeRequest,
  ): Promise<MusicCapabilityInvokeResult> {
    if (!MUSIC_API_DESCRIPTOR.capabilities.includes(request.capability)) {
      return {
        ok: false,
        capability: request.capability,
        errorCode: "capability_unknown",
        messageFr: `Capacité inconnue: ${request.capability}`,
      };
    }
    if (this.mode !== "connected" || !this.hostUrl) {
      return {
        ok: false,
        capability: request.capability,
        errorCode: "not_connected",
        messageFr:
          "Pas d’hôte Akasha connecté — invocation refusée. Desktop local indépendant.",
      };
    }
    return this.transport.invoke(
      this.hostUrl,
      this.preferences.accessToken,
      request,
    );
  }

  async register(): Promise<void> {
    await this.enableHostMode({ hostOptIn: true });
  }
}

/** @deprecated Prefer DesktopFirstAkashaHostBridge. */
export class StubAkashaHostBridge extends DesktopFirstAkashaHostBridge {}

let sharedBridge: DesktopFirstAkashaHostBridge | null = null;

export function createAkashaHostBridge(
  options?: DesktopFirstAkashaHostBridgeOptions,
): DesktopFirstAkashaHostBridge {
  return new DesktopFirstAkashaHostBridge(options);
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
