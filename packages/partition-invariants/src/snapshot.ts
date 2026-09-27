import type {
  ScoreChordEvent,
  ScoreEventSnapshot,
  ScoreNoteEvent,
  ScoreStructureEvent,
} from "./types.js";

/**
 * Minimal ScoreDocument-shaped input so this package stays free of a
 * hard dependency on @song-maker/score-engine (same shape as phase 2).
 */
export type ScoreDocumentLike = {
  tempoMap: { tick: number; quarterBpm: number }[];
  voices: {
    id: string;
    notes: {
      id: string;
      pitch: number;
      startTick: number;
      durationTick: number;
    }[];
  }[];
  chordEvents: { tick: number; symbol: string }[];
  sections: { id: string; kind: string; startTick: number }[];
};

/** Build an event snapshot from a phase-2 ScoreDocument (or compatible). */
export function snapshotFromScoreDocument(
  doc: ScoreDocumentLike,
): ScoreEventSnapshot {
  const notes: ScoreNoteEvent[] = [];
  for (const voice of doc.voices) {
    for (const note of voice.notes) {
      notes.push({
        id: note.id,
        voiceId: voice.id,
        pitch: note.pitch,
        startTick: note.startTick,
        durationTicks: note.durationTick,
      });
    }
  }
  notes.sort(
    (a, b) =>
      a.startTick - b.startTick ||
      a.voiceId.localeCompare(b.voiceId) ||
      a.pitch - b.pitch,
  );

  const chords: ScoreChordEvent[] = doc.chordEvents
    .map((c) => ({ tick: c.tick, symbol: c.symbol }))
    .sort((a, b) => a.tick - b.tick);

  const sections: ScoreStructureEvent[] = doc.sections
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      startTick: s.startTick,
    }))
    .sort((a, b) => a.startTick - b.startTick);

  const tempoQuarterBpm =
    doc.tempoMap.length > 0 ? doc.tempoMap[0]!.quarterBpm : null;

  return { tempoQuarterBpm, notes, chords, sections };
}
