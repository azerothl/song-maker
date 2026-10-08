import { ScoreEngineError } from "../types/errors.js";
import type { NoteEvent, ScoreVoice } from "../types/score-document.js";
import { exportToYuE2Abc } from "./export.js";
import { importAbcToScoreDocument } from "./import.js";

/**
 * Convert a native YuE2 score to an instrumental score by moving Vocal notes
 * into Ins. Existing Ins notes are kept wherever they do not overlap Vocal.
 */
export type VocalToInsOptions = {
  /** When true, clear Vocal after move (instrumental cover). Default true. */
  clearVocal?: boolean;
};

export type VocalToInsResult = {
  abc: string;
  movedNoteCount: number;
};

export function convertVocalToIns(
  abc: string,
  options: VocalToInsOptions = {},
): VocalToInsResult {
  const clearVocal = options.clearVocal !== false;
  if (!/^V:\s*Vocal(?:\s|$)/im.test(abc) || !/^V:\s*Ins(?:\s|$)/im.test(abc)) {
    throw new ScoreEngineError(
      "dialect_forbidden",
      "hors dialecte YuE2: voix Vocal/Ins requises pour la conversion instrumentale",
    );
  }
  if (/\[(?:[KMQ]):/i.test(abc)) {
    throw new ScoreEngineError(
      "dialect_forbidden",
      "la conversion instrumentale ne peut pas préserver les changements de tonalité, mesure ou tempo en cours de morceau",
    );
  }

  const imported = importAbcToScoreDocument(abc);
  if (imported.empty || imported.issues.length > 0) {
    throw new ScoreEngineError(
      "validation_failed",
      imported.issues[0]?.message ?? "la partition ne contient aucune note lisible",
    );
  }

  const vocal = imported.document.voices.find((voice) => voice.abcVoice === "Vocal");
  const originalIns = imported.document.voices.find((voice) => voice.abcVoice === "Ins");
  if (!vocal) {
    throw new ScoreEngineError("dialect_forbidden", "la partie Vocal est absente de la partition");
  }
  if (imported.document.voices.some(
    (voice) => voice.abcVoice !== "Vocal" && voice.abcVoice !== "Ins" && voice.notes.length > 0,
  )) {
    throw new ScoreEngineError(
      "dialect_forbidden",
      "la partition contient des voix supplémentaires qui ne peuvent pas être conservées par YuE2",
    );
  }
  if (!clearVocal && vocal.notes.length > 0) {
    throw new ScoreEngineError(
      "validation_failed",
      "une partition instrumentale doit laisser la partie Vocal vide",
    );
  }

  const vocalNotes = [...vocal.notes].sort((a, b) => a.startTick - b.startTick);
  // YuE2 may already return an instrumental score with an empty Vocal voice.
  // Keep its ABC untouched: re-exporting a score with no vocal notes can
  // normalize repeated chord annotations and falsely fail the preservation
  // check, while there is nothing to move in the first place.
  if (vocalNotes.length === 0) {
    return { abc, movedNoteCount: 0 };
  }

  const insNotes = [...(originalIns?.notes ?? [])].sort((a, b) => a.startTick - b.startTick);
  assertMonophonic(vocalNotes, "Vocal");
  assertMonophonic(insNotes, "Ins");

  const occupied = vocalNotes.map((note) => ({
    start: note.startTick,
    end: note.startTick + note.durationTick,
  }));
  const retainedIns = insNotes.flatMap((note) => subtractOccupied(note, occupied));
  const merged = [...retainedIns, ...vocalNotes].sort(
    (a, b) => a.startTick - b.startTick || a.pitch - b.pitch,
  );
  assertMonophonic(merged, "Ins instrumental");

  const ins: ScoreVoice = originalIns
    ? { ...originalIns, name: "Ins", role: "melody", abcVoice: "Ins", notes: merged }
    : { id: "voice-ins", name: "Ins", role: "melody", abcVoice: "Ins", notes: merged };
  const voices = imported.document.voices
    .filter((voice) => voice.abcVoice !== "Vocal" && voice.abcVoice !== "Ins")
    .concat(
      { ...vocal, notes: clearVocal ? [] : vocal.notes },
      ins,
    );
  const converted = exportToYuE2Abc(
    { ...imported.document, voices },
    { cot: "full", title: titleFromAbc(abc) },
  ).abc;

  const roundTrip = importAbcToScoreDocument(converted);
  const roundTripVocal = roundTrip.document.voices.find((voice) => voice.abcVoice === "Vocal");
  const roundTripIns = roundTrip.document.voices.find((voice) => voice.abcVoice === "Ins");
  if (
    roundTrip.issues.length > 0 ||
    (roundTripVocal?.notes.length ?? 0) !== (clearVocal ? 0 : vocal.notes.length) ||
    noteSignature(roundTripIns?.notes ?? []) !== noteSignature(merged) ||
    roundTrip.document.tempoMap[0]?.quarterBpm !== imported.document.tempoMap[0]?.quarterBpm ||
    JSON.stringify(roundTrip.document.timeSignatures[0]) !== JSON.stringify(imported.document.timeSignatures[0]) ||
    JSON.stringify(roundTrip.document.keySignatures[0]) !== JSON.stringify(imported.document.keySignatures[0]) ||
    chordSignature(roundTrip.document.chordEvents) !== chordSignature(imported.document.chordEvents) ||
    sectionSignature(roundTrip.document.sections) !== sectionSignature(imported.document.sections)
  ) {
    throw new ScoreEngineError(
      "validation_failed",
      "la conversion ne préserve pas les notes, le tempo ou la mesure de la partition",
    );
  }

  return { abc: converted, movedNoteCount: vocalNotes.length };
}

function assertMonophonic(notes: NoteEvent[], voice: string): void {
  let previousEnd = notes[0]
    ? notes[0].startTick + notes[0].durationTick
    : -1;
  for (let index = 1; index < notes.length; index += 1) {
    const current = notes[index]!;
    if (current.startTick < previousEnd) {
      throw new ScoreEngineError(
        "validation_failed",
        `les notes de la partie ${voice} se chevauchent; conversion instrumentale interrompue`,
      );
    }
    previousEnd = Math.max(previousEnd, current.startTick + current.durationTick);
  }
}

function subtractOccupied(note: NoteEvent, occupied: Array<{ start: number; end: number }>): NoteEvent[] {
  let pieces = [{ start: note.startTick, end: note.startTick + note.durationTick }];
  for (const interval of occupied) {
    pieces = pieces.flatMap((piece) => {
      if (interval.end <= piece.start || interval.start >= piece.end) return [piece];
      const remaining: Array<{ start: number; end: number }> = [];
      if (piece.start < interval.start) remaining.push({ start: piece.start, end: interval.start });
      if (interval.end < piece.end) remaining.push({ start: interval.end, end: piece.end });
      return remaining;
    });
  }
  const untouched = pieces.length === 1 && pieces[0]!.start === note.startTick &&
    pieces[0]!.end === note.startTick + note.durationTick;
  return pieces.map((piece, index) => ({
    ...note,
    id: `${note.id}-instrumental-${index}`,
    startTick: piece.start,
    durationTick: piece.end - piece.start,
    ...(untouched ? {} : { tieStart: false, tieEnd: false }),
  }));
}

function noteSignature(notes: NoteEvent[]): string {
  return [...notes]
    .sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch)
    .map((note) => `${note.startTick}:${note.durationTick}:${note.pitch}`)
    .join("|");
}

function chordSignature(chords: Array<{ tick: number; symbol: string }>): string {
  return [...chords]
    .sort((a, b) => a.tick - b.tick || a.symbol.localeCompare(b.symbol))
    .map((chord) => `${chord.tick}:${chord.symbol}`)
    .join("|");
}

function sectionSignature(sections: Array<{ startTick: number; kind: string }>): string {
  return [...sections]
    .sort((a, b) => a.startTick - b.startTick)
    .map((section) => `${section.startTick}:${section.kind}`)
    .join("|");
}

function titleFromAbc(abc: string): string {
  return abc.split(/\r?\n/).find((line) => line.startsWith("T:"))?.slice(2) ?? "";
}
