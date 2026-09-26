import { INTERNAL_PPQ, TICKS_PER_SIXTEENTH } from "../constants.js";
import type {
  ChordEvent,
  NoteEvent,
  ScoreDocument,
} from "../types/score-document.js";

const U = TICKS_PER_SIXTEENTH;

function note(
  id: string,
  startUnit: number,
  durUnits: number,
  pitch: number,
): NoteEvent {
  return {
    id,
    startTick: startUnit * U,
    durationTick: durUnits * U,
    pitch,
    velocity: 80,
  };
}

/** Pitch helpers: C4=60 … B4=71, c5=72 */
const P = {
  C: 60,
  D: 62,
  E: 64,
  F: 65,
  G: 67,
  A: 69,
  B: 71,
  c: 72,
} as const;

/**
 * ScoreDocument matching YuE examples/melody.abc + score.abc note content
 * at commit bd90e4ccae671d869b3ecaca6d7e893927d29442.
 */
export function buildTonightAwakeFixture(options: {
  withChords: boolean;
  jazzChords?: boolean;
}): ScoreDocument {
  // verse bars (units from 0)
  const versePattern: [number, number][][] = [
    // E2G2A2G2E2D2C4
    [
      [P.E, 2],
      [P.G, 2],
      [P.A, 2],
      [P.G, 2],
      [P.E, 2],
      [P.D, 2],
      [P.C, 4],
    ],
    // D2E2G2E2D2C2D4
    [
      [P.D, 2],
      [P.E, 2],
      [P.G, 2],
      [P.E, 2],
      [P.D, 2],
      [P.C, 2],
      [P.D, 4],
    ],
    // E2G2A2c2B2A2G4
    [
      [P.E, 2],
      [P.G, 2],
      [P.A, 2],
      [P.c, 2],
      [P.B, 2],
      [P.A, 2],
      [P.G, 4],
    ],
    // F2E2D2E2G2E2C4
    [
      [P.F, 2],
      [P.E, 2],
      [P.D, 2],
      [P.E, 2],
      [P.G, 2],
      [P.E, 2],
      [P.C, 4],
    ],
  ];

  const chorusPattern: [number, number][][] = [
    // G2A2c2B2A2G2E4
    [
      [P.G, 2],
      [P.A, 2],
      [P.c, 2],
      [P.B, 2],
      [P.A, 2],
      [P.G, 2],
      [P.E, 4],
    ],
    // F2A2G2E2D2E2G4
    [
      [P.F, 2],
      [P.A, 2],
      [P.G, 2],
      [P.E, 2],
      [P.D, 2],
      [P.E, 2],
      [P.G, 4],
    ],
    // A2c2B2A2G2E2D4
    [
      [P.A, 2],
      [P.c, 2],
      [P.B, 2],
      [P.A, 2],
      [P.G, 2],
      [P.E, 2],
      [P.D, 4],
    ],
    // E2G2A2G2E2D2C4
    [
      [P.E, 2],
      [P.G, 2],
      [P.A, 2],
      [P.G, 2],
      [P.E, 2],
      [P.D, 2],
      [P.C, 4],
    ],
  ];

  const notes: NoteEvent[] = [];
  let unit = 0;
  let idx = 0;
  for (const bar of versePattern) {
    for (const [pitch, dur] of bar) {
      notes.push(note(`v-${idx++}`, unit, dur, pitch));
      unit += dur;
    }
  }
  const chorusStartUnit = unit;
  for (const bar of chorusPattern) {
    for (const [pitch, dur] of bar) {
      notes.push(note(`c-${idx++}`, unit, dur, pitch));
      unit += dur;
    }
  }

  const barUnits = 16;
  let chords: ChordEvent[] = [];
  if (options.withChords) {
    if (options.jazzChords) {
      chords = [
        { tick: 0 * barUnits * U, symbol: "Cmaj7" },
        { tick: 1 * barUnits * U, symbol: "G7" },
        { tick: 2 * barUnits * U, symbol: "Am7" },
        { tick: 3 * barUnits * U, symbol: "Fmaj7" },
        {
          tick: chorusStartUnit * U + 0 * barUnits * U,
          symbol: "Cmaj7",
        },
        {
          tick: chorusStartUnit * U + 1 * barUnits * U,
          symbol: "Fmaj7",
        },
        {
          tick: chorusStartUnit * U + 2 * barUnits * U,
          symbol: "G7",
        },
        {
          tick: chorusStartUnit * U + 3 * barUnits * U,
          symbol: "Cmaj7",
        },
      ];
    } else {
      chords = [
        { tick: 0 * barUnits * U, symbol: "C" },
        { tick: 1 * barUnits * U, symbol: "G" },
        { tick: 2 * barUnits * U, symbol: "Am" },
        { tick: 3 * barUnits * U, symbol: "F" },
        {
          tick: chorusStartUnit * U + 0 * barUnits * U,
          symbol: "C",
        },
        {
          tick: chorusStartUnit * U + 1 * barUnits * U,
          symbol: "F",
        },
        {
          tick: chorusStartUnit * U + 2 * barUnits * U,
          symbol: "G",
        },
        {
          tick: chorusStartUnit * U + 3 * barUnits * U,
          symbol: "C",
        },
      ];
    }
  }

  return {
    id: "fixture-tonight-awake",
    version: 1,
    ppq: INTERNAL_PPQ,
    tempoMap: [{ tick: 0, quarterBpm: 88 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, tonic: "C", mode: "major" }],
    sections: [
      { id: "sec-verse", kind: "verse", startTick: 0 },
      {
        id: "sec-chorus",
        kind: "chorus",
        startTick: chorusStartUnit * U,
      },
    ],
    voices: [
      {
        id: "voice-vocal",
        name: "Vocal Melody",
        role: "vocal",
        abcVoice: "Vocal",
        notes,
      },
    ],
    chordEvents: chords,
    lyricAnchors: [],
    source: "manual",
  };
}
