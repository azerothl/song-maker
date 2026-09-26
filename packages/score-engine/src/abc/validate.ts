import {
  ALLOWED_DURATION_MULTIPLIERS,
  INTERNAL_PPQ,
  PITCH_ERROR_HIGH,
  PITCH_ERROR_LOW,
  PITCH_WARN_HIGH,
  PITCH_WARN_LOW,
  TICKS_PER_SIXTEENTH,
  TICKS_PER_THIRTY_SECOND,
} from "../constants.js";
import {
  dialectRefusal,
  ScoreEngineError,
  type ScoreIssue,
} from "../types/errors.js";
import type {
  AbcExportOptions,
  CotProfile,
  NoteEvent,
  ScoreDocument,
  ScoreVoice,
} from "../types/score-document.js";
import { isAcceptedChordSymbol, validateChordSymbol } from "./chords.js";
import { formatKeyField } from "./pitch.js";

export type UnitLength = "1/16" | "1/32";

export type ValidationResult = {
  ok: boolean;
  issues: ScoreIssue[];
  unitLength?: UnitLength;
};

function vocalLikeVoices(doc: ScoreDocument): ScoreVoice[] {
  return doc.voices.filter(
    (v) =>
      v.abcVoice === "Vocal" ||
      (!v.abcVoice && (v.role === "vocal" || v.role === "melody")),
  );
}

function insVoices(doc: ScoreDocument): ScoreVoice[] {
  return doc.voices.filter((v) => v.abcVoice === "Ins");
}

function notesOverlap(a: NoteEvent, b: NoteEvent): boolean {
  const aEnd = a.startTick + a.durationTick;
  const bEnd = b.startTick + b.durationTick;
  return a.startTick < bEnd && b.startTick < aEnd;
}

function resolveUnitLength(notes: NoteEvent[]): {
  unit?: UnitLength;
  unaligned: NoteEvent[];
} {
  if (notes.length === 0) {
    return { unit: "1/16", unaligned: [] };
  }
  const allSixteenth = notes.every(
    (n) =>
      n.startTick % TICKS_PER_SIXTEENTH === 0 &&
      n.durationTick % TICKS_PER_SIXTEENTH === 0,
  );
  if (allSixteenth) {
    return { unit: "1/16", unaligned: [] };
  }
  const allThirtySecond = notes.every(
    (n) =>
      n.startTick % TICKS_PER_THIRTY_SECOND === 0 &&
      n.durationTick % TICKS_PER_THIRTY_SECOND === 0,
  );
  if (allThirtySecond) {
    return { unit: "1/32", unaligned: [] };
  }
  const unaligned = notes.filter(
    (n) =>
      n.startTick % TICKS_PER_THIRTY_SECOND !== 0 ||
      n.durationTick % TICKS_PER_THIRTY_SECOND !== 0,
  );
  return { unaligned };
}

function durationMultiplier(
  durationTick: number,
  unit: UnitLength,
): number | null {
  const unitTicks =
    unit === "1/16" ? TICKS_PER_SIXTEENTH : TICKS_PER_THIRTY_SECOND;
  if (durationTick % unitTicks !== 0) {
    return null;
  }
  const mult = durationTick / unitTicks;
  if (
    !(ALLOWED_DURATION_MULTIPLIERS as readonly number[]).includes(mult)
  ) {
    return null;
  }
  return mult;
}

/**
 * Validate a ScoreDocument for YuE2 ABC export (§7.4–7.6).
 * Does not mutate the document. Never silently quantizes.
 */
export function validateForAbcExport(
  doc: ScoreDocument,
  options: Pick<AbcExportOptions, "cot">,
): ValidationResult {
  const issues: ScoreIssue[] = [];

  if (options.cot === "off") {
    issues.push({
      code: "abc_with_cot_off",
      severity: "error",
      message:
        "un ABC avec cot=off est une erreur locale : aucun fichier ABC ne doit être envoyé",
    });
    return { ok: false, issues };
  }

  if (doc.ppq !== INTERNAL_PPQ) {
    issues.push({
      code: "validation_failed",
      severity: "error",
      message: `ppq interne attendu ${INTERNAL_PPQ}, reçu ${doc.ppq}`,
    });
  }

  if (doc.tempoMap.length === 0) {
    issues.push({
      code: "missing_tempo",
      severity: "error",
      message:
        "tempo manquant : ne pas inventer 120 ; demander le tempo avant export",
    });
  } else if (doc.tempoMap.length > 1) {
    issues.push({
      code: "tempo_map_too_long",
      severity: "error",
      message:
        "tempo map trop longue : un seul TempoEvent à tick=0 est accepté (pas de time-stretch)",
      ticks: doc.tempoMap.map((t) => t.tick),
    });
  } else {
    const tempo = doc.tempoMap[0]!;
    if (tempo.tick !== 0) {
      issues.push({
        code: "tempo_map_too_long",
        severity: "error",
        message: "le TempoEvent unique doit être à tick=0",
        ticks: [tempo.tick],
      });
    }
    if (!Number.isInteger(tempo.quarterBpm) || tempo.quarterBpm <= 0) {
      issues.push({
        code: "invalid_tempo",
        severity: "error",
        message: `quarterBpm invalide: ${tempo.quarterBpm}`,
      });
    }
  }

  for (const ks of doc.keySignatures) {
    if (ks.mode !== "major" && ks.mode !== "minor") {
      issues.push(
        dialectRefusal(`mode autre que majeur/mineur: ${String(ks.mode)}`),
      );
    } else {
      try {
        formatKeyField(ks.tonic, ks.mode);
      } catch {
        issues.push({
          code: "invalid_key_mode",
          severity: "error",
          message: `tonique non supportée pour K:: ${ks.tonic}`,
        });
      }
    }
  }

  const vocals = vocalLikeVoices(doc);
  const ins = insVoices(doc);
  if (vocals.length + ins.length > 2) {
    issues.push(
      dialectRefusal("une troisième voix ABC", {
        code: "third_abc_voice",
      }),
    );
  }

  for (const voice of vocals) {
    const sorted = [...voice.notes].sort(
      (a, b) => a.startTick - b.startTick || a.pitch - b.pitch,
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (b.startTick >= a.startTick + a.durationTick) {
          break;
        }
        if (notesOverlap(a, b)) {
          issues.push({
            code: "overlapping_vocal_notes",
            severity: "error",
            message: `notes Vocal qui se chevauchent : l'utilisateur doit choisir (ids cités)`,
            noteIds: [a.id, b.id],
          });
        }
      }
    }
  }

  const exportNotes = [...vocals, ...ins].flatMap((v) => v.notes);
  for (const note of exportNotes) {
    if (
      note.pitch < PITCH_ERROR_LOW ||
      note.pitch > PITCH_ERROR_HIGH ||
      !Number.isInteger(note.pitch)
    ) {
      issues.push({
        code: "pitch_out_of_range",
        severity: "error",
        message: `hauteur hors 0..127: ${note.pitch}`,
        noteIds: [note.id],
      });
    } else if (
      note.pitch < PITCH_WARN_LOW ||
      note.pitch > PITCH_WARN_HIGH
    ) {
      issues.push({
        code: "pitch_out_of_reasonable_range",
        severity: "warning",
        message: `hauteur hors plage raisonnable 36..96: ${note.pitch}`,
        noteIds: [note.id],
      });
    }

    if (note.tieStart && note.tieEnd) {
      // allowed on a middle note of a chain; open tie at EOF checked at export
    }
  }

  const { unit, unaligned } = resolveUnitLength(exportNotes);
  if (!unit) {
    issues.push({
      code: "unaligned_duration",
      severity: "error",
      message:
        "durées non alignées sur L:1/16 ni L:1/32 — pas de quantification silencieuse",
      noteIds: unaligned.map((n) => n.id),
    });
  } else {
    for (const note of exportNotes) {
      if (durationMultiplier(note.durationTick, unit) === null) {
        issues.push({
          code: "unaligned_duration",
          severity: "error",
          message: `multiplicateur de durée non admis pour note ${note.id} (${note.durationTick} ticks)`,
          noteIds: [note.id],
        });
      }
    }
  }

  if (options.cot === "full") {
    for (const chord of doc.chordEvents) {
      const reason = validateChordSymbol(chord.symbol);
      if (reason) {
        issues.push({
          code: "invalid_chord",
          severity: "error",
          message: reason,
          symbols: [chord.symbol],
        });
      }
    }
  }

  for (const voice of doc.voices) {
    if (voice.role === "harmony" && voice.notes.length > 0) {
      // Harmony is not an ABC voice; symbols must live in chordEvents
      const hasChords = doc.chordEvents.length > 0;
      if (!hasChords) {
        issues.push({
          code: "invalid_chord",
          severity: "error",
          message:
            "voix harmony : pas une voix ABC ; fournir des ChordEvent valides ou retirer les notes",
        });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return unit ? { ok, issues, unitLength: unit } : { ok, issues };
}

export function assertValidForExport(
  doc: ScoreDocument,
  cot: CotProfile,
): UnitLength {
  const result = validateForAbcExport(doc, { cot });
  if (!result.ok || !result.unitLength) {
    const first =
      result.issues.find((i) => i.severity === "error")?.message ??
      "validation échouée";
    throw new ScoreEngineError("validation_failed", first, result.issues);
  }
  return result.unitLength;
}

export { isAcceptedChordSymbol, durationMultiplier, resolveUnitLength };
