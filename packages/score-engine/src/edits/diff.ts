import type {
  ChordEvent,
  NoteEvent,
  ScoreDocument,
  SongSection,
} from "../types/score-document.js";

export type ScoreNoteDiff = {
  voiceId: string;
  noteId: string;
  kind: "only_left" | "only_right" | "changed";
  left?: NoteEvent;
  right?: NoteEvent;
};

export type ScoreSectionDiff = {
  sectionId: string;
  kind: "only_left" | "only_right" | "changed";
  left?: SongSection;
  right?: SongSection;
};

export type ScoreChordDiff = {
  tick: number;
  kind: "only_left" | "only_right" | "changed";
  left?: ChordEvent;
  right?: ChordEvent;
};

export type ScoreDocumentDiff = {
  noteDiffs: ScoreNoteDiff[];
  sectionDiffs: ScoreSectionDiff[];
  chordDiffs: ScoreChordDiff[];
  metaChanges: string[];
};

/**
 * Pure structural diff of two score documents (notes / sections / chords by id+tick).
 * Used for explicit branch compare and merge conflict listing — never auto-merges.
 */
export function diffScoreDocuments(
  left: ScoreDocument,
  right: ScoreDocument,
): ScoreDocumentDiff {
  const noteDiffs: ScoreNoteDiff[] = [];
  const leftVoices = new Map(left.voices.map((v) => [v.id, v]));
  const rightVoices = new Map(right.voices.map((v) => [v.id, v]));
  const voiceIds = new Set([...leftVoices.keys(), ...rightVoices.keys()]);

  for (const voiceId of voiceIds) {
    const lv = leftVoices.get(voiceId);
    const rv = rightVoices.get(voiceId);
    const leftNotes = new Map((lv?.notes ?? []).map((n) => [n.id, n]));
    const rightNotes = new Map((rv?.notes ?? []).map((n) => [n.id, n]));
    const noteIds = new Set([...leftNotes.keys(), ...rightNotes.keys()]);
    for (const noteId of noteIds) {
      const a = leftNotes.get(noteId);
      const b = rightNotes.get(noteId);
      if (a && !b) {
        noteDiffs.push({ voiceId, noteId, kind: "only_left", left: a });
      } else if (!a && b) {
        noteDiffs.push({ voiceId, noteId, kind: "only_right", right: b });
      } else if (a && b && !notesEqual(a, b)) {
        noteDiffs.push({
          voiceId,
          noteId,
          kind: "changed",
          left: a,
          right: b,
        });
      }
    }
  }

  const sectionDiffs: ScoreSectionDiff[] = [];
  const leftSecs = new Map(left.sections.map((s) => [s.id, s]));
  const rightSecs = new Map(right.sections.map((s) => [s.id, s]));
  for (const id of new Set([...leftSecs.keys(), ...rightSecs.keys()])) {
    const a = leftSecs.get(id);
    const b = rightSecs.get(id);
    if (a && !b) {
      sectionDiffs.push({ sectionId: id, kind: "only_left", left: a });
    } else if (!a && b) {
      sectionDiffs.push({ sectionId: id, kind: "only_right", right: b });
    } else if (a && b && (a.kind !== b.kind || a.startTick !== b.startTick)) {
      sectionDiffs.push({
        sectionId: id,
        kind: "changed",
        left: a,
        right: b,
      });
    }
  }

  const chordDiffs: ScoreChordDiff[] = [];
  const leftChords = new Map(left.chordEvents.map((c) => [c.tick, c]));
  const rightChords = new Map(right.chordEvents.map((c) => [c.tick, c]));
  for (const tick of new Set([...leftChords.keys(), ...rightChords.keys()])) {
    const a = leftChords.get(tick);
    const b = rightChords.get(tick);
    if (a && !b) {
      chordDiffs.push({ tick, kind: "only_left", left: a });
    } else if (!a && b) {
      chordDiffs.push({ tick, kind: "only_right", right: b });
    } else if (a && b && a.symbol !== b.symbol) {
      chordDiffs.push({ tick, kind: "changed", left: a, right: b });
    }
  }

  const metaChanges: string[] = [];
  if ((left.tempoMap[0]?.quarterBpm ?? 120) !== (right.tempoMap[0]?.quarterBpm ?? 120)) {
    metaChanges.push("tempo");
  }
  const lk = left.keySignatures[0];
  const rk = right.keySignatures[0];
  if ((lk?.tonic ?? "C") !== (rk?.tonic ?? "C") || (lk?.mode ?? "major") !== (rk?.mode ?? "major")) {
    metaChanges.push("key");
  }
  const lm = left.timeSignatures[0];
  const rm = right.timeSignatures[0];
  if (
    (lm?.numerator ?? 4) !== (rm?.numerator ?? 4) ||
    (lm?.denominator ?? 4) !== (rm?.denominator ?? 4)
  ) {
    metaChanges.push("meter");
  }
  if ((left.branchName ?? null) !== (right.branchName ?? null)) {
    metaChanges.push("branchName");
  }

  return { noteDiffs, sectionDiffs, chordDiffs, metaChanges };
}

function notesEqual(a: NoteEvent, b: NoteEvent): boolean {
  return (
    a.startTick === b.startTick &&
    a.durationTick === b.durationTick &&
    a.pitch === b.pitch &&
    a.velocity === b.velocity
  );
}

export type NoteConflictChoice = "left" | "right";

export type MergeConflictResolution = {
  /** Key: `${voiceId}:${noteId}` → which side to keep for changed/both-present conflicts. */
  noteChoices: Record<string, NoteConflictChoice>;
  /** Prefer left or right for meta (tempo/key/meter) when they differ. */
  metaSide: "left" | "right";
};

/**
 * Explicit merge of two score documents. Conflicts must be resolved via `resolution`;
 * unresolved note conflicts throw — never a silent merge.
 */
export function mergeScoreDocuments(
  left: ScoreDocument,
  right: ScoreDocument,
  resolution: MergeConflictResolution,
  options?: { id?: string; branchName?: string; parentScoreId?: string },
): ScoreDocument {
  const diff = diffScoreDocuments(left, right);
  const unresolved = diff.noteDiffs.filter(
    (d) =>
      d.kind === "changed" &&
      resolution.noteChoices[`${d.voiceId}:${d.noteId}`] == null,
  );
  if (unresolved.length > 0) {
    throw new Error(
      `Fusion impossible : ${unresolved.length} conflit(s) de notes non résolu(s).`,
    );
  }

  const metaBase = resolution.metaSide === "left" ? left : right;
  const voicesById = new Map(
    left.voices.map((v) => [v.id, { ...v, notes: [...v.notes] }]),
  );
  for (const v of right.voices) {
    if (!voicesById.has(v.id)) {
      voicesById.set(v.id, { ...v, notes: [...v.notes] });
    }
  }

  for (const d of diff.noteDiffs) {
    const voice = voicesById.get(d.voiceId);
    if (!voice) continue;
    const key = `${d.voiceId}:${d.noteId}`;
    if (d.kind === "only_left") {
      // keep left (already in voice)
      continue;
    }
    if (d.kind === "only_right" && d.right) {
      if (!voice.notes.some((n) => n.id === d.noteId)) {
        voice.notes.push(d.right);
      }
      continue;
    }
    if (d.kind === "changed") {
      const choice = resolution.noteChoices[key]!;
      const pick = choice === "left" ? d.left : d.right;
      if (!pick) continue;
      voice.notes = voice.notes.map((n) => (n.id === d.noteId ? pick : n));
      if (!voice.notes.some((n) => n.id === d.noteId)) {
        voice.notes.push(pick);
      }
    }
  }

  const sectionsById = new Map(left.sections.map((s) => [s.id, s]));
  for (const d of diff.sectionDiffs) {
    if (d.kind === "only_right" && d.right) {
      sectionsById.set(d.sectionId, d.right);
    } else if (d.kind === "changed") {
      const pick =
        resolution.metaSide === "left" ? d.left : d.right;
      if (pick) sectionsById.set(d.sectionId, pick);
    }
  }

  const chordsByTick = new Map(left.chordEvents.map((c) => [c.tick, c]));
  for (const d of diff.chordDiffs) {
    if (d.kind === "only_right" && d.right) {
      chordsByTick.set(d.tick, d.right);
    } else if (d.kind === "changed") {
      const pick =
        resolution.metaSide === "left" ? d.left : d.right;
      if (pick) chordsByTick.set(d.tick, pick);
    }
  }

  return {
    ...metaBase,
    id: options?.id ?? `merged-${Date.now().toString(36)}`,
    version: Math.max(left.version, right.version) + 1,
    source: "manual",
    parentScoreId: options?.parentScoreId ?? left.id,
    branchName: options?.branchName ?? `merge-${left.branchName ?? left.id}-${right.branchName ?? right.id}`,
    voices: [...voicesById.values()].map((v) => ({
      ...v,
      notes: [...v.notes].sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch),
    })),
    sections: [...sectionsById.values()].sort((a, b) => a.startTick - b.startTick),
    chordEvents: [...chordsByTick.values()].sort((a, b) => a.tick - b.tick),
  };
}
