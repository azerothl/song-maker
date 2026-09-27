/**
 * Local NAR LoRA training pilot.
 * @see docs/lora-training-pilot.md
 * @see https://github.com/azerothl/song-maker/issues/43
 */

export const TRAINING_JOBS_DIR = "training-jobs" as const;

export type AudioFormat = "wav" | "flac" | "mp3" | "ogg" | "unknown";

export type CorpusSong = {
  /** Stable song id (folder name or hash of primary path). */
  songId: string;
  title: string;
  /** Absolute or relative path to primary audio. */
  audioPath: string;
  format: AudioFormat;
  durationMs: number;
  /** Optional content hash for dupe detection. */
  contentSha256?: string | null;
  /** Optional sidecar paths. */
  stylePath?: string | null;
  lyricsPath?: string | null;
  abcPath?: string | null;
};

export type CorpusValidationIssueCode =
  | "unsupported_format"
  | "duration_too_short"
  | "duration_too_long"
  | "duplicate_hash"
  | "duplicate_path"
  | "missing_audio"
  | "empty_corpus"
  | "insufficient_for_split";

export type CorpusValidationIssue = {
  code: CorpusValidationIssueCode;
  songId?: string;
  messageFr: string;
};

export type CorpusValidationResult = {
  ok: boolean;
  songs: CorpusSong[];
  issues: CorpusValidationIssue[];
  duplicateGroups: string[][];
};

export type SongSplit = {
  trainSongIds: string[];
  valSongIds: string[];
};

export type TrainingJobStatus =
  | "draft"
  | "validated"
  | "queued"
  | "running"
  | "cancelled"
  | "failed"
  | "completed"
  | "not_implemented"
  | "awaiting_adapter_validation";

export type ResourceEstimate = {
  /** Placeholders until measured on target hardware. */
  measured: false;
  vramMib: number;
  diskMib: number;
  durationMinutes: number;
  noteFr: string;
};

export type TrainingJobManifest = {
  schema: "song-maker.lora-training-job";
  schemaVersion: 1;
  jobId: string;
  createdAt: string;
  slot: "nar";
  /** Never voice-cloning claim. */
  purpose: "style_timbre_nar";
  status: TrainingJobStatus;
  rightsConfirmed: boolean;
  corpusRoot: string;
  songs: CorpusSong[];
  split: SongSplit;
  estimate: ResourceEstimate;
  trainerScript: string | null;
  /** Paths relative to job dir. */
  paths: {
    manifest: "manifest.json";
    logs: "logs/train.log";
    metrics: "metrics.json";
    samples: "samples/";
    adapter: "adapter/nar_lora.safetensors";
  };
  baseModelPin: {
    family: "yue2";
    noteFr: string;
  };
  /** Adapter must stay inactive until validation gate passes. */
  autoActivate: false;
  catalogEligible: false;
};

export type TrainingJobLogTail = {
  jobId: string;
  lines: string[];
  truncated: boolean;
};

export type TrainingCancelResult = {
  jobId: string;
  status: "cancelled" | "not_running" | "not_implemented";
  messageFr: string;
};

export type TrainingCleanupResult = {
  jobId: string;
  removed: boolean;
  messageFr: string;
};

export type LaunchTrainingRequest = {
  corpusRoot: string;
  songs: CorpusSong[];
  rightsConfirmed: boolean;
  /** Fraction of songs for validation (by whole song). Default 0.2 */
  valFraction?: number;
  /** Absolute or workspace-relative path to optional trainer script. */
  trainerScriptPath?: string | null;
  /** Injected: whether the trainer script file exists. */
  trainerExists?: boolean;
  jobsRoot?: string;
};

export type LaunchTrainingResult = {
  status: TrainingJobStatus;
  jobId: string;
  jobDir: string;
  manifest: TrainingJobManifest;
  messageFr: string;
  /** True when a trainer script was found and would be shelled out. */
  shelledOut: boolean;
};

export type AdapterValidationStatus =
  | "pending"
  | "format_ok"
  | "load_ok"
  | "render_ok"
  | "catalog_ready"
  | "rejected_fused"
  | "rejected_incompatible"
  | "failed";

export type AdapterValidationReport = {
  status: AdapterValidationStatus;
  adapterPath: string;
  sha256?: string | null;
  messageFr: string;
  /** Must be false until catalog_ready. */
  catalogEligible: boolean;
  autoActivate: false;
};

export const QUALITY_DISCLAIMER_FR =
  "La qualité varie selon le corpus et le trainer. " +
  "Ce pilote adapte le style/timbre NAR ; ce n’est pas un clonage de voix. " +
  "Une baisse de perte seule ne prouve pas une meilleure écoute.";

export const RIGHTS_DISCLAIMER_FR =
  "Confirmez que vous avez les droits d’utiliser ces enregistrements pour un entraînement local. " +
  "Les fichiers restent dans votre espace ; Song Maker n’envoie rien par défaut.";
