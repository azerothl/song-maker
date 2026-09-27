/**
 * SheetSage2 audio → ABC → (user confirm) → YuE2.
 * @see docs/sheetsage2-path.md
 * @see https://github.com/azerothl/song-maker/issues/42
 */

export const SHEETSAGE2_LICENSE = "cc-by-nc-4.0" as const;
export type Sheetsage2LicenseId = typeof SHEETSAGE2_LICENSE;

/** Pinned SheetSage2-GGUF metadata from the product spec (§19). */
export const SHEETSAGE2_WEIGHTS = {
  repo: "audio-cpp/SheetSage2-GGUF",
  filename: "sheetsage2-orig.gguf",
  /** Spec size: 2_708_224_512 bytes */
  byteLength: 2_708_224_512,
  sha256: "52bb5846c452037d39931aa8050885b6c751b9c7afcc8ef6d6d3067d241731a4",
  /** audio.cpp CLI family when wired */
  family: "sheetsage2",
  task: "midi",
} as const;

export type SheetsageAcceleration = "cuda" | "cpu" | "unknown";

export type SheetsageReadinessStatus =
  | "ready"
  | "missing_binary"
  | "missing_weights"
  | "license_not_accepted"
  | "insufficient_disk"
  | "not_implemented";

export type SheetsageRuntimeProbe = {
  /** Path or presence of audio.cpp (or dedicated sheetsage binary) supporting --task midi --family sheetsage2 */
  binaryPresent: boolean;
  binaryPath?: string | null;
  /** sheetsage2-orig.gguf present and optionally hash-verified */
  weightsPresent: boolean;
  weightsPath?: string | null;
  weightsSha256Verified?: boolean;
  licenseAccepted: boolean;
  diskBytesAvailable?: number | null;
  acceleration?: SheetsageAcceleration;
};

export type SheetsageReadiness = {
  status: SheetsageReadinessStatus;
  ok: boolean;
  license: Sheetsage2LicenseId;
  weights: typeof SHEETSAGE2_WEIGHTS;
  acceleration: SheetsageAcceleration;
  messageFr: string;
  /** True only when binary + weights + license are satisfied (still may lack a wired runner). */
  canAttemptTranscribe: boolean;
};

export type SheetsageAudioSourceKind = "user_track" | "mixdown" | "clip";

export type SheetsageAudioSource = {
  kind: SheetsageAudioSourceKind;
  /** Stable id (track id, generation id, or clip id). */
  id: string;
  label: string;
  /** Absolute or project-relative path when known. */
  path?: string | null;
  durationMs?: number | null;
};

export type SheetsageProgressPhase =
  | "queued"
  | "loading_weights"
  | "transcribing"
  | "exporting_abc"
  | "done"
  | "cancelled"
  | "failed";

export type SheetsageProgress = {
  jobId: string;
  phase: SheetsageProgressPhase;
  /** 0–1 when known */
  fraction?: number | null;
  messageFr: string;
};

export type SheetsageCancelHandle = {
  jobId: string;
  cancel: () => void;
};

export type SheetsageTranscribeRequest = {
  source: SheetsageAudioSource;
  /** User must have accepted CC BY-NC for SheetSage2. */
  licenseAccepted: boolean;
  /** Prefer melody-only ABC for YuE2 cot=melody. */
  mode?: "melody" | "full";
  signal?: AbortSignal;
  onProgress?: (progress: SheetsageProgress) => void;
};

export type SheetsageTranscribeStatus =
  | "ok"
  | "not_implemented"
  | "cancelled"
  | "failed"
  | "license_not_accepted"
  | "missing_runtime";

export type SheetsageTranscribeResult = {
  status: SheetsageTranscribeStatus;
  jobId: string;
  /** Proposed ABC — only when status === "ok". Never invent silence→ABC. */
  abc?: string | null;
  warnings: string[];
  messageFr: string;
  /** Honesty: output is a new interpretation, not waveform-preserving. */
  reinterpretationDisclaimerFr: string;
};

/** User must confirm edited ABC before any YuE2 call. */
export type SheetsageConfirmForYue2 = {
  confirmedAbc: string;
  source: SheetsageAudioSource;
  mode: "melody" | "full";
  style: string;
  lyrics: string;
  /** Generation form cot — typically melody when mode is melody. */
  cot: "melody" | "full";
};

export const REINTERPRETATION_DISCLAIMER_FR =
  "Nouvelle interprétation : SheetSage2 propose une partition symbolique, " +
  "puis YuE2 génère une prise neuve. Cela ne conserve pas le chanteur, le timbre, " +
  "l’arrangement ni la forme d’onde d’origine. Modèle SheetSage2 sous CC BY-NC 4.0.";
