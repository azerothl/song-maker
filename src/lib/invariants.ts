import {
  CONSERVATION_LEVEL_LABELS_FR,
  CONSERVATION_LEVELS,
  createPartitionInvariantChecker,
  snapshotFromScoreDocument,
  type ConservationLevel,
  type InvariantCheckResult,
  type ScoreEventSnapshot,
} from "@song-maker/partition-invariants";
import type { ScoreDocument } from "./score";
import { t } from "../ui/i18n";

export {
  CONSERVATION_LEVEL_LABELS_FR,
  CONSERVATION_LEVELS,
  type ConservationLevel,
  type InvariantCheckResult,
};

export function conservationLevelLabel(level: ConservationLevel): string {
  switch (level) {
    case "exact_pitches": return t("phase4.level.exactPitches");
    case "pitches_and_rhythms": return t("phase4.level.pitchesAndRhythms");
    case "contour_only": return t("phase4.level.contourOnly");
    case "limited_melodic_adaptation": return t("phase4.level.limitedAdaptation");
    case "reharmonization": return t("phase4.level.reharmonization");
    case "tempo_change": return t("phase4.level.tempoChange");
    case "structure_change": return t("phase4.level.structureChange");
  }
}

const checker = createPartitionInvariantChecker();

type PersistedBaseline = {
  projectId: string;
  scoreId: string;
  level: ConservationLevel | null;
  snapshot: ScoreEventSnapshot;
  capturedAt: string;
};

const storageKey = (projectId: string) =>
  `song-maker:invariant-baseline:${projectId}`;

/** In-memory baseline for the active project session. */
let baseline: ScoreEventSnapshot | null = null;
let baselineScoreId: string | null = null;
let baselineProjectId: string | null = null;
let baselineLevel: ConservationLevel | null = null;

function readPersisted(projectId: string): PersistedBaseline | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedBaseline;
  } catch {
    return null;
  }
}

function writePersisted(data: PersistedBaseline): void {
  try {
    localStorage.setItem(storageKey(data.projectId), JSON.stringify(data));
  } catch {
    // Quota / private mode — keep in-memory only.
  }
}

function clearPersisted(projectId: string): void {
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // ignore
  }
}

/** Load baseline from disk into memory for a project (call on project open). */
export function loadInvariantBaseline(projectId: string): {
  captured: boolean;
  scoreId: string | null;
  level: ConservationLevel | null;
} {
  const data = readPersisted(projectId);
  if (!data) {
    baseline = null;
    baselineScoreId = null;
    baselineProjectId = projectId;
    baselineLevel = null;
    return { captured: false, scoreId: null, level: null };
  }
  baseline = data.snapshot;
  baselineScoreId = data.scoreId;
  baselineProjectId = projectId;
  baselineLevel = data.level;
  return {
    captured: true,
    scoreId: data.scoreId,
    level: data.level,
  };
}

export function captureInvariantBaseline(
  document: ScoreDocument,
  options?: { projectId?: string; level?: ConservationLevel | null },
): void {
  baseline = snapshotFromScoreDocument(document);
  baselineScoreId = document.id;
  baselineLevel = options?.level ?? baselineLevel;
  const projectId = options?.projectId ?? baselineProjectId;
  if (projectId) {
    baselineProjectId = projectId;
    writePersisted({
      projectId,
      scoreId: document.id,
      level: baselineLevel,
      snapshot: baseline,
      capturedAt: new Date().toISOString(),
    });
  }
}

export function clearInvariantBaseline(projectId?: string): void {
  const pid = projectId ?? baselineProjectId;
  baseline = null;
  baselineScoreId = null;
  baselineLevel = null;
  if (pid) clearPersisted(pid);
}

export function setInvariantBaselineLevel(level: ConservationLevel): void {
  baselineLevel = level;
  if (baselineProjectId && baseline && baselineScoreId) {
    writePersisted({
      projectId: baselineProjectId,
      scoreId: baselineScoreId,
      level,
      snapshot: baseline,
      capturedAt: new Date().toISOString(),
    });
  }
}

export function getInvariantBaselineMeta(): {
  captured: boolean;
  scoreId: string | null;
  level: ConservationLevel | null;
  projectId: string | null;
} {
  return {
    captured: baseline !== null,
    scoreId: baselineScoreId,
    level: baselineLevel,
    projectId: baselineProjectId,
  };
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

/** Snapshot a document without mutating the stored baseline (post-gen check). */
export function checkAgainstSnapshot(
  level: ConservationLevel,
  before: ScoreEventSnapshot,
  document: ScoreDocument,
): InvariantCheckResult {
  const after = snapshotFromScoreDocument(document);
  return checker.check(level, before, after);
}

export function snapshotScore(document: ScoreDocument): ScoreEventSnapshot {
  return snapshotFromScoreDocument(document);
}
