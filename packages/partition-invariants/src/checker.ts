import type {
  ConservationLevel,
  InvariantCheckResult,
  InvariantViolation,
  PartitionInvariantChecker,
  ScoreEventSnapshot,
  ScoreNoteEvent,
} from "./types.js";
import { CONSERVATION_LEVELS } from "./types.js";

function pitchesEqual(a: ScoreNoteEvent[], b: ScoreNoteEvent[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const byId = new Map(b.map((n) => [n.id, n]));
  for (const note of a) {
    const other = byId.get(note.id);
    if (!other) {
      violations.push({
        level: "exact_pitches",
        code: "missing_note",
        message: `Note ${note.id} absente après régénération`,
        noteIds: [note.id],
      });
      continue;
    }
    if (other.pitch !== note.pitch) {
      violations.push({
        level: "exact_pitches",
        code: "pitch_changed",
        message: `Hauteur modifiée pour ${note.id}: ${note.pitch} → ${other.pitch}`,
        noteIds: [note.id],
      });
    }
  }
  return violations;
}

function rhythmsEqual(a: ScoreNoteEvent[], b: ScoreNoteEvent[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const byId = new Map(b.map((n) => [n.id, n]));
  for (const note of a) {
    const other = byId.get(note.id);
    if (!other) {
      continue;
    }
    if (
      other.startTick !== note.startTick ||
      other.durationTicks !== note.durationTicks
    ) {
      violations.push({
        level: "pitches_and_rhythms",
        code: "rhythm_changed",
        message: `Rythme modifié pour ${note.id}`,
        noteIds: [note.id],
      });
    }
  }
  return violations;
}

/**
 * Stub checker: implements exact pitch / pitch+rhythm comparisons.
 * Contour, reharmonization, tempo, and structure return "not implemented"
 * violations so phase 4 can fill algorithms without changing the API.
 */
export class StubPartitionInvariantChecker implements PartitionInvariantChecker {
  check(
    level: ConservationLevel,
    before: ScoreEventSnapshot,
    after: ScoreEventSnapshot,
  ): InvariantCheckResult {
    switch (level) {
      case "exact_pitches": {
        const violations = pitchesEqual(before.notes, after.notes);
        return { level, ok: violations.length === 0, violations };
      }
      case "pitches_and_rhythms": {
        const violations = [
          ...pitchesEqual(before.notes, after.notes).map((v) => ({
            ...v,
            level: "pitches_and_rhythms" as const,
          })),
          ...rhythmsEqual(before.notes, after.notes),
        ];
        return { level, ok: violations.length === 0, violations };
      }
      case "contour_only":
      case "limited_melodic_adaptation":
      case "reharmonization":
      case "tempo_change":
      case "structure_change":
        return {
          level,
          ok: false,
          violations: [
            {
              level,
              code: "stub_unimplemented",
              message: `Niveau ${level} : vérificateur phase 4 non implémenté (événements seulement, pas de diff ABC).`,
            },
          ],
        };
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

export function createPartitionInvariantChecker(): PartitionInvariantChecker {
  return new StubPartitionInvariantChecker();
}

export function isConservationLevel(value: string): value is ConservationLevel {
  return (CONSERVATION_LEVELS as readonly string[]).includes(value);
}
