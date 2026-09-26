/** Internal PPQ (§7). One quarter note = 960 ticks. */
export const INTERNAL_PPQ = 960 as const;

/** Sixteenth-note unit when L:1/16 (§7). */
export const TICKS_PER_SIXTEENTH = 240 as const;

/** Thirty-second-note unit when L:1/32 (§7). */
export const TICKS_PER_THIRTY_SECOND = 120 as const;

/** Soft pitch range warning (§7.4). */
export const PITCH_WARN_LOW = 36;
export const PITCH_WARN_HIGH = 96;

/** Hard MIDI pitch range (§7.4). */
export const PITCH_ERROR_LOW = 0;
export const PITCH_ERROR_HIGH = 127;

/** Duration multipliers admitted by the YuE2 dialect (§7.6). */
export const ALLOWED_DURATION_MULTIPLIERS = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48,
] as const;

/** Chord suffixes accepted on Vocal (§7.6). Empty string = major triad. */
export const ACCEPTED_CHORD_SUFFIXES = [
  "",
  "m",
  "dim",
  "aug",
  "7",
  "maj7",
  "m7",
  "dim7",
  "m7b5",
  "sus4",
  "sus2",
  "6",
  "m6",
  "7sus4",
  "m(maj7)",
] as const;

export const DIALECT_REFUSAL_MESSAGE = "hors dialecte YuE2" as const;

export const SECTION_KINDS = [
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "interlude",
  "outro",
  "other",
] as const;
