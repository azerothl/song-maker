import { buildTonightAwakeFixture } from "../../packages/score-engine/src/fixtures/tonight-awake";
import {
  INTERNAL_PPQ,
  TICKS_PER_SIXTEENTH,
  type NoteEvent,
  type ScoreDocument,
} from "@song-maker/score-engine";

const U = TICKS_PER_SIXTEENTH;

/**
 * Partition de référence pour le bench d'ouverture de l'onglet Partition.
 *
 * Calquée sur un morceau réel ~3 min : ~800 notes, export ABC multi-mesures,
 * et une timeline étirée (silences / import MIDI) qui gonfle le PianoRoll caché.
 */
export function buildReferenceScoreDocument(): ScoreDocument {
  const base = buildTonightAwakeFixture({ withChords: true, jazzChords: true });
  const vocal = base.voices[0];
  if (!vocal) {
    return base;
  }

  const pattern: NoteEvent[] = vocal.notes.map((n) => ({ ...n }));
  const notes: NoteEvent[] = [];
  let barOffsetUnits = 0;
  let id = 0;
  /** ~22 cycles × 8 mesures ≈ 90 mesures, ~770 notes. */
  const cycles = 22;
  for (let c = 0; c < cycles; c++) {
    let unit = barOffsetUnits;
    for (const n of pattern) {
      const durUnits = n.durationTick / U;
      notes.push({
        ...n,
        id: `ref-${id++}`,
        startTick: unit * U,
        durationTick: n.durationTick,
      });
      unit += durUnits;
    }
    barOffsetUnits = unit;
  }

  /**
   * Fin de timeline ~3 min @ 88 bpm, avec queue silencieuse longue (import MIDI /
   * durée cible) — gonfle maxTick et la largeur du piano-roll monté en parallèle.
   */
  const songEndTick = Math.max(
    Math.round((180 * 88 / 60) * INTERNAL_PPQ),
    INTERNAL_PPQ * 5200,
  );
  const maxNoteEnd = notes.reduce(
    (m, n) => Math.max(m, n.startTick + n.durationTick),
    0,
  );
  const tailStart = Math.max(maxNoteEnd + U * 16, songEndTick - U * 64);

  return {
    ...base,
    id: "bench-reference-score",
    voices: [
      {
        ...vocal,
        notes: [
          ...notes,
          {
            id: `ref-tail-${id}`,
            startTick: tailStart,
            durationTick: U * 4,
            pitch: 60,
            velocity: 40,
          },
        ],
      },
      {
        id: "voice-ins",
        name: "Instruments",
        role: "other",
        abcVoice: "Ins",
        notes: [],
      },
    ],
    sections: [
      ...base.sections,
      { id: "sec-outro", kind: "outro", startTick: tailStart },
    ],
  };
}

export function referenceScoreStats(doc: ScoreDocument): {
  noteCount: number;
  maxTick: number;
  pianoRollWidthPx: number;
} {
  const voice = doc.voices[0];
  let maxTick = 3840;
  for (const n of voice?.notes ?? []) {
    maxTick = Math.max(maxTick, n.startTick + n.durationTick + 960);
  }
  for (const s of doc.sections) {
    maxTick = Math.max(maxTick, s.startTick + 1920);
  }
  const noteCount = doc.voices.reduce((sum, v) => sum + v.notes.length, 0);
  return {
    noteCount,
    maxTick,
    pianoRollWidthPx: Math.max(640, maxTick * 0.04),
  };
}
