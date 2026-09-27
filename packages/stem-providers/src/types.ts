/**
 * Stem separator contracts for Song Maker phase 3 (§9, §23).
 *
 * Phase 1 ships a single path: audiocpp / htdemucs_q8_0 after soxr resample.
 * Phase 3 routes through StemSeparatorProvider and may select BS-RoFormer when
 * its GGUF is present under the cache (not in the first-build installer).
 */

/** Four roles of the first build; guitar/piano only if a provider emits them. */
export type StemRole =
  | "vocals"
  | "drums"
  | "bass"
  | "other"
  | "guitar"
  | "piano";

/** Display names (French UI). `other` is never renamed Synths. */
export const STEM_DISPLAY_NAMES: Record<StemRole, string> = {
  vocals: "Voix",
  drums: "Batterie",
  bass: "Basse",
  other: "Accompagnement",
  guitar: "Guitare",
  piano: "Piano",
};

export type StemReliability = "standard" | "less_reliable";

export type StemAvailability = "available" | "unavailable";

export type StemDescriptor = {
  role: StemRole;
  /** Relative path inside a separation folder, e.g. vocals-48000.wav */
  path: string;
  sha256: string;
  reliability: StemReliability;
};

export type SeparationRequest = {
  /** Absolute or project-relative path to the 48 kHz stereo WAV from YuE2. */
  inputPath: string;
  inputSha256: string;
  /** Project sample rate stays 48000 (§9.3). */
  projectSampleRate: 48000;
  /** Output directory for a new sep-NNN folder. */
  outputDir: string;
  /**
   * Absolute path to the 44,1 kHz soxr-resampled mixture already on disk.
   * Required when calling a live audiocpp transport.
   */
  separatorInputPath?: string;
};

export type SeparationResult = {
  family: string;
  packageId: string;
  gguf?: string;
  sha256?: string;
  separatorInput: {
    path: string;
    sampleRate: 44100;
    resampler: "ffmpeg-soxr-precision-28";
  };
  stems: StemDescriptor[];
  /** Roles this run did not produce (honest UI: guitar/piano, etc.). */
  unavailableRoles: StemRole[];
  warnings: string[];
};

export type StemSeparatorCapabilities = {
  id: string;
  family: string;
  /** Roles this provider can emit on a successful run. */
  roles: readonly StemRole[];
  /** Roles never emitted by this provider (UI must mark them unavailable). */
  unavailableRoles: readonly StemRole[];
  /** True when guitar/piano (or other extras) are estimates only. */
  marksExtrasLessReliable: boolean;
  /** French short label for settings. */
  displayNameFr: string;
  /** One-line honesty about stem layout. */
  stemLayoutNoteFr: string;
};

/**
 * Live audiocpp `/v1/tasks/run` transport injected by the host (Tauri worker
 * or tests). The foundation package does not own HTTP or FFmpeg.
 */
export type AudiocppSepTransport = {
  /**
   * Runs a sep task and writes named WAV files into `outputDir`.
   * Returns the stem ids written (e.g. vocals, drums, instrumental).
   */
  runSeparation(args: {
    modelId: string;
    family: string;
    audioPath44100: string;
    outputDir: string;
  }): Promise<{ namedStemIds: string[] }>;
  /** Optional SHA-256 of a file already on disk. */
  sha256File?(path: string): Promise<string>;
};

/**
 * Interchangeable stem separator (§9, phase 3).
 * Phase 1 may keep calling HTDemucs directly; phase 3 routes through this.
 */
export interface StemSeparatorProvider {
  readonly capabilities: StemSeparatorCapabilities;
  separate(request: SeparationRequest): Promise<SeparationResult>;
}

export function isCoreStemRole(role: StemRole): boolean {
  return (
    role === "vocals" ||
    role === "drums" ||
    role === "bass" ||
    role === "other"
  );
}

export function reliabilityForRole(role: StemRole): StemReliability {
  if (role === "guitar" || role === "piano") {
    return "less_reliable";
  }
  return "standard";
}

export function availabilityForRole(
  role: StemRole,
  capabilities: StemSeparatorCapabilities,
): StemAvailability {
  if (capabilities.roles.includes(role)) {
    return "available";
  }
  return "unavailable";
}
