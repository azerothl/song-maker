/**
 * Stem separator contracts for Song Maker phase 3 (§9, §23).
 *
 * Phase 1 ships a single path: audiocpp / htdemucs_q8_0 after soxr resample.
 * This package holds the interchangeable-provider surface so phase 3 can plug
 * a second family (BS-RoFormer) without touching phase 1 screens.
 */

/** Four roles of the first build; guitar/piano arrive later (§9.2, §10.3). */
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
  warnings: string[];
};

export type StemSeparatorCapabilities = {
  id: string;
  family: string;
  /** Roles this provider can emit. */
  roles: readonly StemRole[];
  /** True when guitar/piano (or other extras) are estimates only. */
  marksExtrasLessReliable: boolean;
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
