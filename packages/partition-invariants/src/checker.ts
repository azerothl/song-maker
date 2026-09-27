import type {
  ConservationLevel,
  InvariantCheckResult,
  InvariantViolation,
  PartitionInvariantChecker,
  ScoreEventSnapshot,
  ScoreNoteEvent,
} from "./types.js";
import { CONSERVATION_LEVELS } from "./types.js";

/** Max |Δpitch| allowed under limited melodic adaptation (§11.3). */
export const LIMITED_ADAPTATION_SEMITONES = 2;

function orderedNotes(notes: ScoreNoteEvent[]): ScoreNoteEvent[] {
  return [...notes].sort(
    (a, b) =>
      a.startTick - b.startTick ||
      a.voiceId.localeCompare(b.voiceId) ||
      a.pitch - b.pitch ||
      a.id.localeCompare(b.id),
  );
}

function pairByIdOrSequence(
  before: ScoreNoteEvent[],
  after: ScoreNoteEvent[],
): { before: ScoreNoteEvent; after: ScoreNoteEvent | null }[] {
  const byId = new Map(after.map((n) => [n.id, n]));
  const used = new Set<string>();
  const pairs: { before: ScoreNoteEvent; after: ScoreNoteEvent | null }[] = [];

  for (const note of orderedNotes(before)) {
    const match = byId.get(note.id);
    if (match) {
      used.add(match.id);
      pairs.push({ before: note, after: match });
    } else {
      pairs.push({ before: note, after: null });
    }
  }

  // Sequence fallback for regenerated ids: fill nulls from unused after notes.
  const unused = orderedNotes(after).filter((n) => !used.has(n.id));
  let ui = 0;
  for (const pair of pairs) {
    if (pair.after === null && ui < unused.length) {
      pair.after = unused[ui]!;
      ui += 1;
    }
  }
  return pairs;
}

function pitchesEqual(
  before: ScoreNoteEvent[],
  after: ScoreNoteEvent[],
  level: ConservationLevel,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const pairs = pairByIdOrSequence(before, after);
  for (const { before: note, after: other } of pairs) {
    if (!other) {
      violations.push({
        level,
        code: "missing_note",
        message: `Note ${note.id} absente après régénération`,
        noteIds: [note.id],
      });
      continue;
    }
    if (other.pitch !== note.pitch) {
      violations.push({
        level,
        code: "pitch_changed",
        message: `Hauteur modifiée pour ${note.id}: ${note.pitch} → ${other.pitch}`,
        noteIds: [note.id, other.id],
      });
    }
  }
  if (after.length > before.length) {
    violations.push({
      level,
      code: "extra_notes",
      message: `Notes en trop après régénération (${after.length} > ${before.length})`,
    });
  }
  return violations;
}

function rhythmsEqual(
  before: ScoreNoteEvent[],
  after: ScoreNoteEvent[],
  level: ConservationLevel,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const { before: note, after: other } of pairByIdOrSequence(
    before,
    after,
  )) {
    if (!other) continue;
    if (
      other.startTick !== note.startTick ||
      other.durationTicks !== note.durationTicks
    ) {
      violations.push({
        level,
        code: "rhythm_changed",
        message: `Rythme modifié pour ${note.id}`,
        noteIds: [note.id, other.id],
      });
    }
  }
  return violations;
}

/** Contour: successive pitch movement signs (−1 / 0 / +1). */
export function pitchContour(notes: ScoreNoteEvent[]): number[] {
  const ordered = orderedNotes(notes);
  const contour: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const d = ordered[i]!.pitch - ordered[i - 1]!.pitch;
    contour.push(Math.sign(d));
  }
  return contour;
}

function checkContour(
  before: ScoreEventSnapshot,
  after: ScoreEventSnapshot,
): InvariantCheckResult {
  const level = "contour_only" as const;
  const a = pitchContour(before.notes);
  const b = pitchContour(after.notes);
  const violations: InvariantViolation[] = [];
  if (a.length !== b.length) {
    violations.push({
      level,
      code: "contour_length",
      message: `Contour de longueur différente (${a.length} → ${b.length})`,
    });
  } else {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        violations.push({
          level,
          code: "contour_changed",
          message: `Contour modifié à l’intervalle ${i}: ${a[i]} → ${b[i]}`,
        });
        break;
      }
    }
  }
  return { level, ok: violations.length === 0, violations };
}

function checkLimitedAdaptation(
  before: ScoreEventSnapshot,
  after: ScoreEventSnapshot,
): InvariantCheckResult {
  const level = "limited_melodic_adaptation" as const;
  const violations: InvariantViolation[] = [
    ...rhythmsEqual(before.notes, after.notes, level),
  ];
  for (const { before: note, after: other } of pairByIdOrSequence(
    before.notes,
    after.notes,
  )) {
    if (!other) {
      violations.push({
        level,
        code: "missing_note",
        message: `Note ${note.id} absente après adaptation`,
        noteIds: [note.id],
      });
      continue;
    }
    const delta = Math.abs(other.pitch - note.pitch);
    if (delta > LIMITED_ADAPTATION_SEMITONES) {
      violations.push({
        level,
        code: "adaptation_too_large",
        message: `Adaptation mélodique trop large pour ${note.id}: Δ${delta} > ${LIMITED_ADAPTATION_SEMITONES} demi-tons`,
        noteIds: [note.id, other.id],
      });
    }
  }
  return { level, ok: violations.length === 0, violations };
}

function checkReharmonization(
  before: ScoreEventSnapshot,
  after: ScoreEventSnapshot,
): InvariantCheckResult {
  const level = "reharmonization" as const;
  // Melody (pitches + rhythms) conserved; chords may differ freely.
  const violations = [
    ...pitchesEqual(before.notes, after.notes, level),
    ...rhythmsEqual(before.notes, after.notes, level),
  ];
  return { level, ok: violations.length === 0, violations };
}

function checkTempoChange(
  before: ScoreEventSnapshot,
  after: ScoreEventSnapshot,
): InvariantCheckResult {
  const level = "tempo_change" as const;
  // Notes conserved; tempo may differ (no violation if BPM changes).
  const violations = [
    ...pitchesEqual(before.notes, after.notes, level),
    ...rhythmsEqual(before.notes, after.notes, level),
  ];
  return { level, ok: violations.length === 0, violations };
}

function checkStructureChange(
  before: ScoreEventSnapshot,
  after: ScoreEventSnapshot,
): InvariantCheckResult {
  const level = "structure_change" as const;
  // Sections may differ; pitches + rhythms of notes conserved.
  // (Structure-diff algorithms beyond section presence are not defined.)
  const violations = [
    ...pitchesEqual(before.notes, after.notes, level),
    ...rhythmsEqual(before.notes, after.notes, level),
  ];
  return { level, ok: violations.length === 0, violations };
}

/**
 * Event-based conservation checker (§11.3).
 * Never compares ABC text. Undefined metrics stay honest stubs.
 */
export class PartitionInvariantCheckerImpl implements PartitionInvariantChecker {
  check(
    level: ConservationLevel,
    before: ScoreEventSnapshot,
    after: ScoreEventSnapshot,
  ): InvariantCheckResult {
    switch (level) {
      case "exact_pitches": {
        const violations = pitchesEqual(before.notes, after.notes, level);
        return { level, ok: violations.length === 0, violations };
      }
      case "pitches_and_rhythms": {
        const violations = [
          ...pitchesEqual(before.notes, after.notes, level),
          ...rhythmsEqual(before.notes, after.notes, level),
        ];
        return { level, ok: violations.length === 0, violations };
      }
      case "contour_only":
        return checkContour(before, after);
      case "limited_melodic_adaptation":
        return checkLimitedAdaptation(before, after);
      case "reharmonization":
        return checkReharmonization(before, after);
      case "tempo_change":
        return checkTempoChange(before, after);
      case "structure_change":
        return checkStructureChange(before, after);
      default: {
        const _exhaustive: never = level;
        return {
          level: _exhaustive,
          ok: false,
          violations: [
            {
              level: _exhaustive,
              code: "unknown_level",
              message: `Niveau de conservation inconnu: ${String(level)}`,
            },
          ],
        };
      }
    }
  }
}

/** @deprecated Prefer PartitionInvariantCheckerImpl — kept for import stability. */
export class StubPartitionInvariantChecker extends PartitionInvariantCheckerImpl {}

export function createPartitionInvariantChecker(): PartitionInvariantChecker {
  return new PartitionInvariantCheckerImpl();
}

export function isConservationLevel(value: string): value is ConservationLevel {
  return (CONSERVATION_LEVELS as readonly string[]).includes(value);
}

export const CONSERVATION_LEVEL_LABELS_FR: Record<ConservationLevel, string> = {
  exact_pitches: "Hauteurs exactes",
  pitches_and_rhythms: "Hauteurs et rythmes",
  contour_only: "Contour seulement",
  limited_melodic_adaptation: "Adaptation mélodique limitée",
  reharmonization: "Réharmonisation",
  tempo_change: "Changement de tempo",
  structure_change: "Changement de structure",
};
