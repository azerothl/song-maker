import type { NoteEvent, ScoreDocument } from "../types/score-document.js";

export type TransposeSelection = {
  /** When set, only these voices are transposed. Default: all voices. */
  voiceIds?: string[];
  /** When set, only these note ids (within selected voices) are transposed. */
  noteIds?: string[];
};

/**
 * Transpose selected notes by semitones. Pitches clamped to MIDI 0..127.
 */
export function transposeNotes(
  doc: ScoreDocument,
  semitones: number,
  selection: TransposeSelection = {},
): ScoreDocument {
  const delta = Math.round(semitones);
  if (delta === 0) return doc;
  const voiceFilter = selection.voiceIds
    ? new Set(selection.voiceIds)
    : null;
  const noteFilter = selection.noteIds ? new Set(selection.noteIds) : null;

  return {
    ...doc,
    version: doc.version + 1,
    source: doc.source === "midi" ? "manual" : doc.source,
    voices: doc.voices.map((v) => {
      if (voiceFilter && !voiceFilter.has(v.id)) return v;
      return {
        ...v,
        notes: v.notes.map((n) => {
          if (noteFilter && !noteFilter.has(n.id)) return n;
          return transposeNote(n, delta);
        }),
      };
    }),
  };
}

/** Transpose every note in the document. */
export function transposeScore(
  doc: ScoreDocument,
  semitones: number,
): ScoreDocument {
  return transposeNotes(doc, semitones);
}

function transposeNote(note: NoteEvent, semitones: number): NoteEvent {
  const pitch = Math.min(127, Math.max(0, note.pitch + semitones));
  return { ...note, pitch };
}
