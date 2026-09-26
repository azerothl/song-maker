import { INTERNAL_PPQ, SECTION_KINDS } from "../constants.js";

export type ScoreSource = "midi" | "abc" | "generated" | "manual";

export type ScoreVoiceRole =
  | "vocal"
  | "melody"
  | "harmony"
  | "bass"
  | "accompaniment"
  | "other";

/**
 * Target ABC voice. Phase 2 marks Ins explicitly (§7.6).
 * Default: vocal/melody → Vocal; unset otherwise.
 */
export type AbcVoiceTarget = "Vocal" | "Ins";

export type ModeName = "major" | "minor";

export type SectionKind = (typeof SECTION_KINDS)[number];

export type TempoEvent = {
  tick: number;
  /** Integer BPM for a quarter note; must be > 0. */
  quarterBpm: number;
};

export type TimeSignatureEvent = {
  tick: number;
  numerator: number;
  denominator: number;
};

export type KeySignatureEvent = {
  tick: number;
  tonic: string;
  mode: ModeName;
};

export type SongSection = {
  id: string;
  kind: SectionKind;
  startTick: number;
};

export type ChordEvent = {
  tick: number;
  symbol: string;
};

export type LyricAnchor = {
  id: string;
  sectionId: string | null;
  lineIndex: number;
  syllable: string | null;
  noteIds: string[];
};

export type NoteEvent = {
  id: string;
  startTick: number;
  durationTick: number;
  /** MIDI pitch 0..127. */
  pitch: number;
  velocity: number;
  tieStart?: boolean;
  tieEnd?: boolean;
};

export type ScoreVoice = {
  id: string;
  name: string;
  role: ScoreVoiceRole;
  notes: NoteEvent[];
  /** Explicit Ins/Vocal assignment for ABC export (§7.6). */
  abcVoice?: AbcVoiceTarget;
};

export type ScoreDocument = {
  id: string;
  version: number;
  ppq: typeof INTERNAL_PPQ;
  tempoMap: TempoEvent[];
  timeSignatures: TimeSignatureEvent[];
  keySignatures: KeySignatureEvent[];
  sections: SongSection[];
  voices: ScoreVoice[];
  chordEvents: ChordEvent[];
  lyricAnchors: LyricAnchor[];
  source: ScoreSource;
  sourceFileHash?: string;
};

export type CotProfile = "full" | "melody" | "off";

export type AbcExportOptions = {
  cot: CotProfile;
  /**
   * When true with cot=melody, replace Ins with multi-measure rests (Z).
   * Matches « mélodie vocale seule » (§7.3).
   */
  vocalOnly?: boolean;
  title?: string;
};
