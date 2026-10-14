import type { ScoreIssue } from "./score";

export type ScoreIssueKind = "overlaps" | "pitch" | "rhythm" | "tempo" | "voices" | "chords" | "key" | "disabled" | "format";
export type ScoreIssueGroup = {
  kind: ScoreIssueKind;
  count: number;
  noteIds: string[];
};

export function scoreIssueKind(code: ScoreIssue["code"]): ScoreIssueKind {
  switch (code) {
    case "overlapping_vocal_notes":
    case "midi_overlapping_notes": return "overlaps";
    case "pitch_out_of_range":
    case "pitch_out_of_reasonable_range": return "pitch";
    case "unaligned_duration": return "rhythm";
    case "missing_tempo":
    case "invalid_tempo":
    case "tempo_map_too_long":
    case "midi_tempo_changes": return "tempo";
    case "third_abc_voice":
    case "midi_ambiguous_melody":
    case "midi_ambiguous_channel": return "voices";
    case "invalid_chord": return "chords";
    case "invalid_key_mode": return "key";
    case "abc_with_cot_off": return "disabled";
    default: return "format";
  }
}

/** Keep the UI bounded even when transcription produces thousands of diagnostics. */
export function groupScoreIssues(issues: readonly ScoreIssue[]): ScoreIssueGroup[] {
  const groups = new Map<ScoreIssueKind, ScoreIssueGroup>();
  const seen = new Set<string>();
  for (const issue of issues) {
    const identity = JSON.stringify([issue.code, issue.severity, issue.message, issue.noteIds, issue.ticks, issue.symbols]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const kind = scoreIssueKind(issue.code);
    const group = groups.get(kind) ?? { kind, count: 0, noteIds: [] };
    group.count += 1;
    for (const id of issue.noteIds ?? []) {
      if (group.noteIds.length < 3 && !group.noteIds.includes(id)) group.noteIds.push(id);
    }
    groups.set(kind, group);
  }
  return [...groups.values()];
}
