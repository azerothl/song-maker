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
  /** Plafond demandé à YuE2 (secondes). */
  targetDurationSec?: number;
  activeGenerationId?: string | null;
  activeSeparationId?: string | null;
  activeMixId?: string | null;
  activeScoreId?: string | null;
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
  /** Plafond de durée en secondes (pas de 30, max 360). */
  targetDurationSec: number;
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

export type AppSettings = {
  projectsDir: string;
  cacheDir: string;
  binaryTag: string;
  binaryArchive: string;
  binarySha256: string;
  modelPack: string;
  modelGguf: string;
  modelSha256: string;
  serverHost: string;
  serverPort: number;
  outputDevice?: string | null;
};

export type HealthSnapshot = {
  cudaAvailable: boolean;
  gpuName?: string | null;
  driverVersion?: string | null;
  vramMib?: number | null;
  suggestedPack: string;
  modelsOk: boolean;
  binaryOk: boolean;
  serverHealthy: boolean;
  serverUrl?: string | null;
  message: string;
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
};

export type Screen = "splash" | "library" | "song" | "settings" | "licenses";
