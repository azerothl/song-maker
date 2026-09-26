/**
 * Partition conservation invariants — phase 4 (§11.3).
 * Checked on score events, never by ABC text diff.
 * Not a criterion of phase 1 or phase 2.
 */

/** Conservation levels the user may pick before a regeneration. */
export type ConservationLevel =
  | "exact_pitches"
  | "pitches_and_rhythms"
  | "contour_only"
  | "limited_melodic_adaptation"
  | "reharmonization"
  | "tempo_change"
  | "structure_change";

export const CONSERVATION_LEVELS: readonly ConservationLevel[] = [
  "exact_pitches",
  "pitches_and_rhythms",
  "contour_only",
  "limited_melodic_adaptation",
  "reharmonization",
  "tempo_change",
  "structure_change",
] as const;

/** Minimal note event shape for invariant checks (phase 2 ScoreDocument subset). */
export type ScoreNoteEvent = {
  id: string;
  voiceId: string;
  /** MIDI pitch 0..127 */
  pitch: number;
  startTick: number;
  durationTicks: number;
};

export type ScoreChordEvent = {
  tick: number;
  symbol: string;
};

export type ScoreStructureEvent = {
  id: string;
  kind: string;
  startTick: number;
};

export type ScoreEventSnapshot = {
  tempoQuarterBpm: number | null;
  notes: ScoreNoteEvent[];
  chords: ScoreChordEvent[];
  sections: ScoreStructureEvent[];
};

export type InvariantViolation = {
  level: ConservationLevel;
  code: string;
  message: string;
  noteIds?: string[];
};

export type InvariantCheckResult = {
  level: ConservationLevel;
  ok: boolean;
  violations: InvariantViolation[];
};

/**
 * Compares before/after event snapshots for a chosen conservation level.
 */
export interface PartitionInvariantChecker {
  check(
    level: ConservationLevel,
    before: ScoreEventSnapshot,
    after: ScoreEventSnapshot,
  ): InvariantCheckResult;
}
