import type {
  AppSettings,
  FormInput,
  HealthSnapshot,
  PlaybackSources,
  ProjectDoc,
} from "../lib/types";
import type { ProfilesState } from "../lib/profilesTypes";
import {
  PROFILE_RENAME_ERROR_EMPTY,
  PROFILE_RENAME_ERROR_TOO_LONG,
} from "../lib/profileRenameErrors";
import {
  PROFILE_NAME_MAX_LENGTH,
  profileNameCharCount,
} from "../lib/profileRenameValidation";
import { CAPTURE_PROJECT_ID } from "./seedCreateTabCaptureStore";
import { SIDEBAR_CAPTURE_PROJECT_ID } from "./seedSidebarCaptureStore";

let project: ProjectDoc | null = null;
let captureProfilesState: ProfilesState | null = null;
let captureLibraryProjects: Array<Record<string, unknown>> | null = null;

export function registerCaptureProfilesState(state: ProfilesState | null): void {
  captureProfilesState = state;
}

export function registerCaptureLibraryProjects(
  rows: Array<Record<string, unknown>> | null,
): void {
  captureLibraryProjects = rows;
}

function ensureProject(): ProjectDoc {
  if (!project) {
    throw new Error("Capture mock : projet non initialisé.");
  }
  return project;
}

const emptyPlayback: PlaybackSources = {
  mode: "empty",
  generationWav: null,
  stems: [],
  label: "",
};

const captureHealth: HealthSnapshot = {
  cudaAvailable: true,
  accelerationKind: "nvidiaCuda",
  gpuName: "Capture (mock)",
  driverVersion: "560.00",
  vramMib: 12288,
  suggestedPack: "q4",
  suggestedPackReasonFr: "Capture navigateur.",
  localYue2Enabled: true,
  modelsOk: true,
  binaryOk: true,
  serverHealthy: true,
  serverUrl: null,
  message: "Capture navigateur — backend mocké.",
};

const captureSettings: AppSettings = {
  projectsDir: "/tmp/capture-projects",
  cacheDir: "/tmp/capture-cache",
  binaryTag: "capture",
  binaryArchive: "capture.zip",
  binarySha256: "",
  modelPack: "q4",
  modelGguf: "capture.gguf",
  modelSha256: "",
  serverHost: "127.0.0.1",
  serverPort: 8080,
  stemSeparator: "htdemucs",
  ccByNcAccepted: true,
  yue2LicenseAccepted: true,
  localYue2Enabled: true,
  acceptedSeparatorLicenses: {},
  separatorTimeStats: {
    htdemucs: { msPerAudioSec: 1200, samples: 3 },
  },
  mixLlmProvider: "ollama",
  mixLlmBaseUrl: "http://127.0.0.1:11434",
  mixLlmModelId: "qwen3.5:2b",
  mixLlmAllowRemote: false,
};

export function isTauri(): boolean {
  return false;
}

/** Stub navigateur : pas de conversion asset:// */
export function convertFileSrc(filePath: string): string {
  return filePath;
}

/** Stubs pour les imports transitifs (plugin-updater). */
export class Channel<T = unknown> {
  id: string;
  constructor(onMessage?: (message: T) => void) {
    this.id = "capture-channel";
    void onMessage;
  }
  static _new<T>(_callback: (message: T) => void): Channel<T> {
    return new Channel(_callback);
  }
}

export class Resource {
  async close(): Promise<void> {}
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  switch (cmd) {
    case "native_capture_backend":
      return {
        hostApi: "mock",
        exclusive: false,
        asio: false,
        platform: "linux",
        roundTripMeasured: false,
        notesFr: "Capture mock navigateur — pas de cpal.",
      } as T;
    case "list_native_capture_devices":
      return [] as T;
    case "start_native_capture":
    case "poll_native_capture":
    case "pause_native_capture":
    case "stop_native_capture":
      throw new Error("Capture native absente du mock navigateur.");
    case "embedded_declui_status":
    case "start_embedded_declui_host":
    case "stop_embedded_declui_host":
      return {
        running: false,
        url: null,
        bind: "127.0.0.1",
        notesFr: "Mock navigateur — pas d’hôte embarqué.",
      } as T;
    case "vst3_spike_status":
      return { enabled: false, isHost: false, notesFr: "" } as T;
    case "vst3_spike_scan":
      return [] as T;
    case "list_midi_outputs":
    case "midi_output_support":
    case "connect_midi_output":
    case "disconnect_midi_output":
    case "play_midi_output":
    case "panic_midi_output": {
      const hook = (globalThis as typeof globalThis & {
        __captureMidiOutput?: (cmd:string,args?:Record<string,unknown>)=>unknown;
      }).__captureMidiOutput;
      if(hook)return await hook(cmd,args) as T;
      if(cmd==="list_midi_outputs")return [] as T;
      if(cmd==="midi_output_support")return {os:"linux",backend:"ALSA",portCount:0,nativeProof:false,honestyFr:"Linux : ALSA via midir, compilé. Lister les ports n’est pas une preuve jack/USB. 0 port(s) visible(s) ici."} as T;
      return undefined as T;
    }
    case "propose_qwen_mix": {
      const hook = (globalThis as typeof globalThis & {
        __captureQwenMix?: (args?: Record<string, unknown>) => unknown;
      }).__captureQwenMix;
      if (hook) return await hook(args) as T;
      throw new Error("MODEL_MISSING");
    }
    case "list_projects":
      if (captureLibraryProjects) {
        return captureLibraryProjects as T;
      }
      return [
        {
          id: SIDEBAR_CAPTURE_PROJECT_ID,
          title: "Morceau bibliothèque",
          folderPath: "/tmp/capture",
          createdAt: "2026-09-29T12:00:00.000Z",
          updatedAt: "2026-09-29T12:00:00.000Z",
          durationMs: 180_000,
          status: "empty",
          cot: "full",
          activeGenerationId: null,
        },
      ] as T;
    case "open_project": {
      const id = String(args?.id ?? CAPTURE_PROJECT_ID);
      if (id !== CAPTURE_PROJECT_ID && id !== SIDEBAR_CAPTURE_PROJECT_ID) {
        throw new Error(`Projet inconnu : ${id}`);
      }
      if (!project) {
        throw new Error(`Projet inconnu : ${id}`);
      }
      return project as T;
    }
    case "save_project_form": {
      const id = String(args?.id ?? "");
      const form = args?.form as FormInput | undefined;
      const base = ensureProject();
      if (id !== base.id || !form) return base as T;
      project = {
        ...base,
        title: form.title,
        style: form.style,
        lyrics: form.lyrics,
        cot: form.cot,
        singingLanguage: form.singingLanguage,
        tempoBpm: form.tempoBpm,
        key: form.key,
        meter: form.meter,
        targetDurationSec: form.targetDurationSec,
        preferFullLyrics: form.preferFullLyrics,
        instrumentalMode: form.instrumentalMode,
        updatedAt: new Date().toISOString(),
      };
      return project as T;
    }
    case "load_mix":
      return null as T;
    case "list_generations":
      return [] as T;
    case "load_score":
      return null as T;
    case "playback_sources":
      return emptyPlayback as T;
    case "render_preview":
      return null as T;
    case "load_separation_info":
      return null as T;
    case "save_production_overlay":
    case "load_production_overlay":
      return null as T;
    case "load_production_overlay_disk":
      return null as T;
    case "get_health":
      return captureHealth as T;
    case "get_settings":
      return captureSettings as T;
    case "update_settings": {
      const next = args?.settings as AppSettings | undefined;
      if (next) Object.assign(captureSettings, next);
      return (next ?? captureSettings) as T;
    }
    case "list_scores":
      return [] as T;
    case "load_score_version":
      return null as T;
    case "save_score":
      return { project: ensureProject() } as T;
    case "set_active_score":
      return ensureProject() as T;
    case "get_phase3_status":
      return {
        stemSeparator: "htdemucs",
        htdemucsAvailable: true,
        bsRoformerAvailable: false,
        bsRoformerPath: "",
        melBandRoformerAvailable: false,
        melBandRoformerPath: "",
        htdemucs6sRuntimeAvailable: false,
        ccByNcAccepted: true,
        acceptedSeparatorLicenses: { htdemucs: true },
        separatorTimeStats: captureSettings.separatorTimeStats ?? {},
        guitarPianoAvailable: false,
        honestyFr: "Capture mock.",
      } as T;
    case "bs_roformer_install_info":
      return {
        gguf: "bs.gguf",
        sha256: "c".repeat(64),
        bytes: 165_000_000,
        remotePath: "models/bs.gguf",
        url: "https://example.test/bs.gguf",
        licenseNoticeFr: "Licence mock BS-RoFormer.",
        path: "/tmp/capture-cache/bs.gguf",
        available: false,
        defaultSeparator: "bs_roformer",
        stemLayoutFr: "voix / batterie / basse / autre",
      } as T;
    case "mel_band_roformer_install_info":
      return {
        gguf: "mel.gguf",
        sha256: "d".repeat(64),
        bytes: 180_000_000,
        remotePath: "models/mel.gguf",
        url: "https://example.test/mel.gguf",
        licenseNoticeFr: "Licence mock Mel-Band.",
        path: "/tmp/capture-cache/mel.gguf",
        available: false,
        defaultSeparator: "mel_band_roformer",
        stemLayoutFr: "voix / instruments",
      } as T;
    case "export_separation_stems":
      return "/tmp/capture-export/stems.zip" as T;
    case "list_lora_adapters":
      return [] as T;
    case "get_profiles_state":
      if (captureProfilesState) {
        return captureProfilesState as T;
      }
      return {
        profiles: [
          {
            id: "profile-001",
            name: "Hobby",
            kind: "hobby",
            projectCount: 12,
            acceptedContractCount: 3,
            isLastUsed: true,
            isActive: true,
          },
          {
            id: "profile-002",
            name: "Reprises",
            kind: "hobby",
            projectCount: 4,
            acceptedContractCount: 1,
            isLastUsed: false,
            isActive: false,
          },
          {
            id: "profile-003",
            name: "Studio Maison",
            kind: "commercial",
            projectCount: 0,
            acceptedContractCount: 0,
            isLastUsed: false,
            isActive: false,
          },
        ],
        activeProfileId: "profile-001",
        lastUsedProfileId: "profile-001",
        onboardingComplete: true,
        migrationBannerVisible: false,
        commercialCreationAllowed: false,
        maxProfiles: 6,
      } as T;
    case "create_profile": {
      const name = String(args?.name ?? "Nouveau").trim();
      if (!name) {
        throw PROFILE_RENAME_ERROR_EMPTY;
      }
      if (profileNameCharCount(name) > PROFILE_NAME_MAX_LENGTH) {
        throw PROFILE_RENAME_ERROR_TOO_LONG;
      }
      const kind = String(args?.kind ?? "hobby");
      return {
        id: "profile-new",
        name,
        kind,
        projectCount: 0,
        acceptedContractCount: 0,
        isLastUsed: false,
        isActive: false,
      } as T;
    }
    case "activate_profile":
    case "rename_profile":
    case "dismiss_profile_migration_banner":
    case "accept_engine_contract":
      return undefined as T;
    case "get_job_status":
      return { state: "idle", label: "" } as T;
    default:
      console.warn(`[capture mock] invoke non géré : ${cmd}`);
      return null as T;
  }
}

/** Appelé par la page capture après construction du ProjectDoc. */
export function registerCaptureProject(doc: ProjectDoc): void {
  project = doc;
}
