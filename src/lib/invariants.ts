import {
  CONSERVATION_LEVEL_LABELS_FR,
  CONSERVATION_LEVELS,
  createPartitionInvariantChecker,
  snapshotFromScoreDocument,
  type ConservationLevel,
  type InvariantCheckResult,
} from "@song-maker/partition-invariants";
import type { ScoreDocument } from "./score";

export {
  CONSERVATION_LEVEL_LABELS_FR,
  CONSERVATION_LEVELS,
  type ConservationLevel,
  type InvariantCheckResult,
};

const checker = createPartitionInvariantChecker();

/** Baseline snapshot kept while the user edits before regenerating. */
let baseline: ReturnType<typeof snapshotFromScoreDocument> | null = null;
let baselineScoreId: string | null = null;

export function captureInvariantBaseline(document: ScoreDocument): void {
  baseline = snapshotFromScoreDocument(document);
  baselineScoreId = document.id;
}

export function clearInvariantBaseline(): void {
  baseline = null;
  baselineScoreId = null;
}

export function getInvariantBaselineMeta(): {
  captured: boolean;
  scoreId: string | null;
} {
  return { captured: baseline !== null, scoreId: baselineScoreId };
}

/**
 * Check current document against the captured baseline for a conservation level.
 * Returns null when no baseline (phase 1 path / first edit).
 */
export function checkConservation(
  level: ConservationLevel,
  document: ScoreDocument,
): InvariantCheckResult | null {
  if (!baseline) return null;
  const after = snapshotFromScoreDocument(document);
  return checker.check(level, baseline, after);
}
