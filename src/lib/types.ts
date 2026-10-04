export type KeySig = { tonic: string; mode: string };
export type Meter = { numerator: number; denominator: number };

export type ProjectDoc = {
  schema: string;
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  style: string;
  lyrics: string;
  cot: string;
  singingLanguage?: string | null;
  tempoBpm?: number | null;
  key?: KeySig | null;
  meter?: Meter | null;
  /** Durée cible demandée à YuE2 (secondes). */
  targetDurationSec?: number;
  preferFullLyrics?: boolean;
  /** Mode instrumental : paroles facultatives (YuE2 / audio.cpp). */
  instrumentalMode?: boolean;
  activeGenerationId?: string | null;
  activeSeparationId?: string | null;
  activeMixId?: string | null;
  activeScoreId?: string | null;
  /** Noms parlants des prises (clé = id gen-*). */
  generationNames?: Record<string, string>;
};

export type LibraryRow = {
  id: string;
  title: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  durationMs?: number | null;
  status: string;
  cot: string;
  activeGenerationId?: string | null;
};

export type FormInput = {
  title: string;
  style: string;
  lyrics: string;
  cot: string;
  singingLanguage?: string | null;
  tempoBpm?: number | null;
  key?: KeySig | null;
  meter?: Meter | null;
  seed?: number | null;
  /** Durée cible en secondes (pas de 30, max 360). */
  targetDurationSec: number;
  /** Let YuE exceed the target when the lyric token budget requires it. */
  preferFullLyrics: boolean;
  /**
   * Mode instrumental : paroles facultatives.
   * Chaîne vide autorisée ; audio.cpp YuE2 génère alors sans texte vocal.
   */
  instrumentalMode: boolean;
    continuationGenerationId?: string | null;
  /** Reference audio path. Pinned YuE2 / ACE-Step refuse this (#324). */
  audioInputPath?: string | null;
  inpaintStartMs?: number | null;
  inpaintEndMs?: number | null;
};

export type MixClip = {
  id: string;
  trackId: string;
  sourcePath: string;
  sourceSha256: string;
  startMs: number;
  offsetMs: number;
  durationMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** Source material tempo (BPM) for follow-project stretch (#95). */
  sourceTempoBpm?: number | null;
  /** Stretch so source tempo matches project tempo (pitch preserved). */
  followProjectTempo?: boolean;
  /** Explicit timeline/source ratio when not following project tempo. */
  timeStretchRatio?: number | null;
  /** Independent transpose in semitones (0 = none). */
  pitchSemitones?: number | null;
  /** Bypass stretch/pitch; original region used as-is. Default true when set. */
  processingEnabled?: boolean;
  /** Manual transient / beat markers in source milliseconds. */
  transientMarkersMs?: number[];
  /** Loop-capture take group id (#93). */
  takeGroupId?: string | null;
  takeIndex?: number | null;
  takeLabel?: string | null;
  /** When false inside a take group, clip is kept but silent. */
  takeActive?: boolean;
};

export type MixTrack = {
  id: string;
  role: string;
  name: string;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  locked: boolean;
  aiSeparated: boolean;
  clips: MixClip[];
  /** Spike VST3 (#326) — metadata only, not processed. */
  experimentalVst3Insert?: {
    pluginPath: string;
    factoryPresent: boolean;
    stateB64?: string | null;
    notesFr: string;
  } | null;
};

/** Arrangement tempo change (ms timeline). Clip storage stays in ms (#94). */
export type MixTempoEvent = {
  startMs: number;
  quarterBpm: number;
};

/** Arrangement meter change (ms timeline). */
export type MixMeterEvent = {
  startMs: number;
  numerator: number;
  denominator: number;
};

export type MixMarkerKind =
  | "intro"
  | "verse"
  | "prechorus"
  | "chorus"
  | "bridge"
  | "interlude"
  | "outro"
  | "other";

/** Named section marker on the mix arrangement timeline. */
export type MixMarker = {
  id: string;
  name: string;
  kind: MixMarkerKind;
  startMs: number;
};

export type MixDoc = {
  schema: string;
  schemaVersion: number;
  id: string;
  separationId: string;
  sampleRate: number;
  masterGainDb: number;
  peakCeilingDb: number;
  tracks: MixTrack[];
  /**
   * Musical grid tempo map. Absent/empty on legacy mixes → default 120 BPM at 0 ms
   * (see `ensureMixArrangement`); clip positions are never rewritten on load.
   */
  tempoMap?: MixTempoEvent[];
  /** Meter changes for the musical grid. Absent → 4/4 at 0 ms. */
  timeSignatures?: MixMeterEvent[];
  /** Named section markers (intro, couplet, …). */
  markers?: MixMarker[];
};

export type PlaybackStem = {
  role: string;
  name: string;
  trackId: string;
  path: string;
};

export type PlaybackSources = {
  mode: "generation" | "stems" | string;
  generationId?: string | null;
  generationWav?: string | null;
  stems: PlaybackStem[];
  label: string;
};

export type SeparationInfo = {
  id: string;
  family: string;
  warnings: string[];
};

export type SeparationVersionSummary = {
  separationId: string;
  mixId: string;
  createdAt: string;
  isActive: boolean;
  /** Generation that was active when this separation ran (from job.json). */
  generationId?: string | null;
};

export type AppSettings = {
  projectsDir: string;
  cacheDir: string;
  binaryTag: string;
  binaryArchive: string;
  binarySha256: string;
  modelPack: string;
  modelGguf: string;
  modelSha256: string;
  generationEngine?: "yue2" | "ace_step" | string;
  serverHost: string;
  serverPort: number;
  outputDevice?: string | null;
  /**
   * Soft-synth / MIDI monitoring lookahead (ms). Default 20.
   * Documented latency budget for Windows + other platforms (#96).
   */
  audioLatencyMs?: number;
  /** Phase 3: `htdemucs` (default) | `htdemucs_6s` | `bs_roformer` | `mel_band_roformer` */
  stemSeparator?: string;
  /** CC BY-NC gate for optional LoRA packs */
  ccByNcAccepted?: boolean;
  /** Consentement distinct au modèle principal YuE2 CC BY-NC 4.0. */
  yue2LicenseAccepted?: boolean;
  /** Consentement au téléchargement ACE-Step 1.5 Turbo optionnel. */
  aceStepLicenseAccepted?: boolean;
  /** Consentement distinct pour le sidecar Lego Base. */
  aceStepLegoLicenseAccepted?: boolean;
  /** Per-model license checkbox (#167). */
  acceptedSeparatorLicenses?: Record<string, boolean>;
  /** Measured separation rates (#166). */
  separatorTimeStats?: Record<string, { msPerAudioSec: number; samples: number }>;
  /** Génération YuE2 locale (false si « continuer sans génération »). */
  localYue2Enabled?: boolean;
  yue2ArLora?: string | null;
  yue2NarLora?: string | null;
  yue2ArLoraScale?: number;
  yue2NarLoraScale?: number;
  /** Mix assistant LLM: `ollama` | `openai_compat` | `rbitnet` | `llama_cpp` | `external`. */
  mixLlmProvider?: string;
  mixLlmBaseUrl?: string;
  mixLlmModelId?: string;
  /** Expert opt-in for non-loopback OpenAI-compat endpoints. */
  mixLlmAllowRemote?: boolean;
};

export type Phase3Status = {
  stemSeparator: string;
  htdemucsAvailable: boolean;
  bsRoformerAvailable: boolean;
  bsRoformerPath: string;
  melBandRoformerAvailable: boolean;
  melBandRoformerPath: string;
  htdemucs6sRuntimeAvailable: boolean;
  ccByNcAccepted: boolean;
  acceptedSeparatorLicenses: Record<string, boolean>;
  separatorTimeStats: Record<string, { msPerAudioSec: number; samples: number }>;
  guitarPianoAvailable: boolean;
  honestyFr: string;
};

/** `nvidiaCuda` | `appleMetal` | `none` — contrat `get_setup_gpu_info` (#116). */
export type AccelerationKind = "nvidiaCuda" | "appleMetal" | "none" | string;

export type SetupGpuInfo = {
  accelerationKind: AccelerationKind;
  gpuName?: string | null;
  driverVersion?: string | null;
  vramMib?: number | null;
  suggestedPack: string;
  suggestedPackReasonFr: string;
  accelerationAvailable: boolean;
};

export type InstallFileStatus = "complete" | "partial" | "missing" | string;

export type InstallFilePlan = {
  name: string;
  status: InstallFileStatus;
  totalBytes?: number | null;
  receivedBytes: number;
  remainingBytes: number;
};

export type InstallPlan = {
  pack: string;
  fileCount: number;
  bytesToDownload: number;
  bytesKnown: boolean;
  hasPartialDownloads: boolean;
  files: InstallFilePlan[];
};

export type InstallErrorCause =
  | "network"
  | "diskFull"
  | "hashInvalid"
  | "http"
  | "other"
  | string;

export type InstallErrorInfo = {
  message: string;
  cause: InstallErrorCause;
  fileName?: string | null;
};

export type HealthSnapshot = {
  cudaAvailable: boolean;
  accelerationKind?: AccelerationKind;
  gpuName?: string | null;
  driverVersion?: string | null;
  vramMib?: number | null;
  suggestedPack: string;
  suggestedPackReasonFr?: string;
  localYue2Enabled: boolean;
  modelsOk: boolean;
  binaryOk: boolean;
  serverHealthy: boolean;
  serverUrl?: string | null;
  message: string;
  /** Official Python YuE2 is not installed and is not a fallback (#328). */
  pythonYue2Runtime?: "absent_by_design" | string;
  /** House-model desktop provider (#323). Never generates until a decoder is wired. */
  houseModelRuntime?: "unavailable" | "weights_present_unwired" | string;
  /** ACE-Step 1.5 Base Lego sidecar. */
  aceStepLegoRuntime?: "missing" | "installed" | "ready" | string;
};

export type InstallProgress = {
  state: "downloading" | "preparing" | "error" | "complete" | string;
  label: string;
  fileIndex: number;
  fileCount: number;
  receivedBytes: number;
  totalBytes?: number | null;
  fileName?: string | null;
  bytesPerSec?: number | null;
  etaSeconds?: number | null;
  etaIsEstimate?: boolean;
  overallReceivedBytes?: number | null;
  overallTotalBytes?: number | null;
  overallBytesPerSec?: number | null;
  overallEtaSeconds?: number | null;
  overallEtaIsEstimate?: boolean;
  error?: InstallErrorInfo | null;
};

export type JobStatus = {
  state: string;
  label: string;
  projectId?: string | null;
  queuePosition?: number | null;
  error?: string | null;
};

export type GenerationSummary = {
  id: string;
  createdAt: string;
  seed: number;
  cot: string;
  state: string;
  hasScore: boolean;
  parentGenerationId?: string | null;
  audioPath?: string | null;
  semanticTruncated?: boolean | null;
  canContinue: boolean;
  /** `yue2_3b` (default) or `ace_step_1_5`. */
  engineId?: string;
};

export type ScoreSummary = {
  id: string;
  parentScoreId?: string | null;
  branchName?: string | null;
  version: number;
  source: string;
  noteCount: number;
  createdAt?: string | null;
};

export type MixVersionSummary = {
  id: string;
  separationId: string;
  createdAt: string;
  isActive: boolean;
};

export type LocalLoraAdapter = { name: string; path: string; sizeBytes: number };

export type Screen =
  | "profiles"
  | "splash"
  | "library"
  | "song"
  | "settings"
  | "licenses";
