const PITCH_PC: readonly string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Nom de hauteur MIDI (ex. `C4`, `F#3`) pour libellés accessibles. */
export function midiPitchName(pitch: number): string {
  const p = Math.round(pitch);
  const pc = ((p % 12) + 12) % 12;
  const octave = Math.floor(p / 12) - 1;
  return `${PITCH_PC[pc]}${octave}`;
}
