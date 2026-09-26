/**
 * Key / pitch helpers for YuE2 ABC dialect (§7.5–7.6).
 */

const TONIC_TO_K_FIELD: Record<string, string> = {
  C: "C",
  "C#": "^C",
  Db: "_D",
  D: "D",
  "D#": "^D",
  Eb: "_E",
  E: "E",
  F: "F",
  "F#": "^F",
  Gb: "_G",
  G: "G",
  "G#": "^G",
  Ab: "_A",
  A: "A",
  "A#": "^A",
  Bb: "_B",
  B: "B",
};

/** Spec table for K: field spelling (§7.5). */
const K_FIELD_PREFERRED: Record<string, string> = {
  C: "C",
  "C#": "^C",
  Eb: "_E",
  "F#": "^F",
  Ab: "_A",
  Bb: "_B",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  A: "A",
  B: "B",
};

const NOTE_NAMES_SHARP = [
  "C",
  "^C",
  "D",
  "^D",
  "E",
  "F",
  "^F",
  "G",
  "^G",
  "A",
  "^A",
  "B",
] as const;

const NOTE_NAMES_FLAT = [
  "C",
  "_D",
  "D",
  "_E",
  "E",
  "F",
  "_G",
  "G",
  "_A",
  "A",
  "_B",
  "B",
] as const;

export function formatKeyField(tonic: string, mode: "major" | "minor"): string {
  const preferred = K_FIELD_PREFERRED[tonic] ?? TONIC_TO_K_FIELD[tonic];
  if (!preferred) {
    throw new Error(`unsupported tonic for K: field: ${tonic}`);
  }
  if (mode === "minor") {
    return `${preferred}m`;
  }
  return preferred;
}

/**
 * MIDI pitch → ABC pitch token relative to middle C = C (MIDI 60).
 * Accidentals are written explicitly; bar persistence is handled by the exporter.
 */
export function midiToAbcPitch(
  midi: number,
  preferFlats = false,
): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new Error(`MIDI pitch out of range: ${midi}`);
  }
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 5; // MIDI 60 → octave 0 → "C"
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const base = names[pc]!;

  if (octave === 0) {
    return base;
  }
  if (octave === 1) {
    // One octave up: lowercase
    return lowerAbc(base);
  }
  if (octave === 2) {
    return `${lowerAbc(base)}'`;
  }
  if (octave > 2) {
    return `${lowerAbc(base)}${"'".repeat(octave - 1)}`;
  }
  if (octave === -1) {
    return `${base},`;
  }
  return `${base}${",".repeat(-octave)}`;
}

function lowerAbc(token: string): string {
  // ^C → ^c, _E → _e, C → c
  if (token.startsWith("^") || token.startsWith("_") || token.startsWith("=")) {
    return token[0]! + token.slice(1).toLowerCase();
  }
  return token.toLowerCase();
}

/** Inverse of midiToAbcPitch for natural/sharp/flat tokens used in fixtures. */
export function abcPitchToMidi(token: string): number {
  const match = /^(?:\^|_|=)?([A-Ga-g])(,*|'*)$/.exec(token);
  if (!match) {
    throw new Error(`unsupported ABC pitch token: ${token}`);
  }
  const letter = match[1]!;
  const octMarks = match[2] ?? "";
  const accidental = token.startsWith("^")
    ? 1
    : token.startsWith("_")
      ? -1
      : 0;

  const upper = letter.toUpperCase();
  const naturalPc: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const pc = (naturalPc[upper]! + accidental + 12) % 12;

  let octave: number;
  if (letter === letter.toUpperCase()) {
    // C = MIDI 60 → octave index 0 in our scheme; commas go down
    octave = 0 - octMarks.length;
  } else {
    // c = MIDI 72
    octave = 1 + (octMarks.match(/'/g)?.length ?? 0);
  }

  return (octave + 5) * 12 + pc;
}
