import { DIALECT_REFUSAL_MESSAGE } from "../constants.js";

export type ScoreErrorCode =
  | "missing_tempo"
  | "tempo_map_too_long"
  | "invalid_tempo"
  | "unaligned_duration"
  | "overlapping_vocal_notes"
  | "pitch_out_of_range"
  | "pitch_out_of_reasonable_range"
  | "invalid_chord"
  | "invalid_key_mode"
  | "abc_with_cot_off"
  | "third_abc_voice"
  | "dialect_forbidden"
  | "midi_ambiguous_melody"
  | "midi_overlapping_notes"
  | "midi_ambiguous_channel"
  | "midi_tempo_changes"
  | "not_implemented"
  | "validation_failed";

export type ScoreIssueSeverity = "error" | "warning";

export type ScoreIssue = {
  code: ScoreErrorCode;
  severity: ScoreIssueSeverity;
  message: string;
  noteIds?: string[];
  symbols?: string[];
  ticks?: number[];
};

export class ScoreEngineError extends Error {
  readonly code: ScoreErrorCode;
  readonly issues: ScoreIssue[];

  constructor(code: ScoreErrorCode, message: string, issues: ScoreIssue[] = []) {
    super(message);
    this.name = "ScoreEngineError";
    this.code = code;
    this.issues = issues;
  }
}

export function dialectRefusal(
  detail: string,
  extras: Partial<ScoreIssue> = {},
): ScoreIssue {
  return {
    code: "dialect_forbidden",
    severity: "error",
    message: `${DIALECT_REFUSAL_MESSAGE}: ${detail}`,
    ...extras,
  };
}
