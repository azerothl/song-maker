export { INTERNAL_PPQ, TICKS_PER_SIXTEENTH, TICKS_PER_THIRTY_SECOND } from "./constants.js";
export type {
  ScoreDocument,
  ScoreVoice,
  ScoreVoiceRole,
  NoteEvent,
  TempoEvent,
  TimeSignatureEvent,
  KeySignatureEvent,
  SongSection,
  ChordEvent,
  LyricAnchor,
  AbcExportOptions,
  CotProfile,
  AbcVoiceTarget,
  ModeName,
  SectionKind,
  ScoreSource,
} from "./types/score-document.js";
export type { Clip, ClipEditKind, ClipEditRequest } from "./types/clip.js";
export {
  ScoreEngineError,
  dialectRefusal,
  type ScoreErrorCode,
  type ScoreIssue,
  type ScoreIssueSeverity,
} from "./types/errors.js";

export {
  validateForAbcExport,
  assertValidForExport,
  type ValidationResult,
  type UnitLength,
} from "./abc/validate.js";
export {
  exportToYuE2Abc,
  normalizeAbc,
  type AbcExportResult,
} from "./abc/export.js";
export { validateChordSymbol, isAcceptedChordSymbol } from "./abc/chords.js";
export { midiToAbcPitch, abcPitchToMidi, formatKeyField } from "./abc/pitch.js";
export { convertVocalToIns, type VocalToInsOptions, type VocalToInsResult } from "./abc/vocal-to-ins.js";

export {
  importMidiToScoreDocument,
  applyQuantization,
  buildMinimalMidi,
  type MidiImportOptions,
  type MidiImportResult,
  type MidiTrackSnapshot,
} from "./midi/import.js";
export { exportScoreDocumentToMidi } from "./midi/export.js";
export {
  transposeNotes,
  transposeScore,
  type TransposeSelection,
} from "./edits/transpose.js";
export {
  diffScoreDocuments,
  mergeScoreDocuments,
  type ScoreDocumentDiff,
  type ScoreNoteDiff,
  type ScoreSectionDiff,
  type ScoreChordDiff,
  type MergeConflictResolution,
  type NoteConflictChoice,
} from "./edits/diff.js";

export {
  createClipEditor,
  DefaultClipEditor,
  StubClipEditor,
  type ClipEditor,
} from "./clips/edits.js";
export {
  createCandidateComparer,
  DefaultCandidateComparer,
  StubCandidateComparer,
  type CandidateComparer,
  type GenerationCandidate,
  type CandidateCompareView,
} from "./candidates/compare.js";
export {
  createStopAfterAbcClient,
  GatedStopAfterAbcClient,
  StubStopAfterAbcClient,
  planStopAfterAbc,
  validateStopAfterAbc,
  STOP_AFTER_ABC_ENABLED,
  STOP_AFTER_ABC_MIN_TAG,
  type StopAfterAbcClient,
  type StopAfterAbcRequest,
  type StopAfterAbcResult,
  type StopAfterAbcTaskOptions,
  type StopAfterStage,
} from "./generation/stop-after.js";
export {
  createSemanticPrefixClient,
  DesktopSemanticPrefixClient,
  StubSemanticPrefixClient,
  planSemanticPrefixContinuation,
  validateSemanticPrefixContinuation,
  SEMANTIC_PREFIX_ENABLED,
  SEMANTIC_PREFIX_MIN_TAG,
  SEMANTIC_HZ,
  SEMANTIC_MAX_DURATION_SEC,
  SEMANTIC_TOKEN_CEILING,
  type SemanticPrefixClient,
  type SemanticPrefixRequest,
  type SemanticPrefixResult,
  type SemanticPrefixTaskOptions,
  type SemanticPrefixFrames,
  type ParentGenerationSemanticState,
} from "./generation/semantic-prefix.js";

export { buildTonightAwakeFixture } from "./fixtures/tonight-awake.js";
