import {
  applyQuantization,
  convertVocalToIns,
  diffScoreDocuments,
  exportScoreDocumentToMidi,
  exportToYuE2Abc,
  importMidiToScoreDocument,
  INTERNAL_PPQ,
  mergeScoreDocuments,
  transposeNotes,
  transposeScore,
  validateChordSymbol,
  validateForAbcExport,
  type AbcVoiceTarget,
  type CotProfile,
  type MergeConflictResolution,
  type MidiImportResult,
  type ModeName,
  type ScoreDocument,
  type ScoreDocumentDiff,
  type ScoreIssue,
  type ScoreVoiceRole,
  type SectionKind,
  type SongSection,
  type TransposeSelection,
} from "@song-maker/score-engine";

export type {
  CotProfile,
  MergeConflictResolution,
  MidiImportResult,
  ModeName,
  ScoreDocument,
  ScoreDocumentDiff,
  ScoreIssue,
  ScoreVoiceRole,
  SongSection,
  SectionKind,
  TransposeSelection,
  AbcVoiceTarget,
};

export function importMidiBytes(
  bytes: Uint8Array,
  options?: {
    applyQuantize?: boolean;
    quantizeTicks?: number;
    id?: string;
    sourceFileHash?: string;
  },
): MidiImportResult {
  return importMidiToScoreDocument(bytes, options);
}

export function quantizeScore(
  doc: ScoreDocument,
  quantizeTicks: number,
): ScoreDocument {
  return applyQuantization(doc, quantizeTicks);
}

export function exportScoreMidi(doc: ScoreDocument): Uint8Array {
  return exportScoreDocumentToMidi(doc);
}

export function transposeScoreNotes(
  doc: ScoreDocument,
  semitones: number,
  selection?: TransposeSelection,
): ScoreDocument {
  return transposeNotes(doc, semitones, selection);
}

export function transposeWholeScore(
  doc: ScoreDocument,
  semitones: number,
): ScoreDocument {
  return transposeScore(doc, semitones);
}

export function diffScores(
  left: ScoreDocument,
  right: ScoreDocument,
): ScoreDocumentDiff {
  return diffScoreDocuments(left, right);
}

export function mergeScores(
  left: ScoreDocument,
  right: ScoreDocument,
  resolution: MergeConflictResolution,
  options?: { id?: string; branchName?: string; parentScoreId?: string },
): ScoreDocument {
  return mergeScoreDocuments(left, right, resolution, options);
}

export function createEmptyScoreDocument(options?: {
  id?: string;
  tempoBpm?: number;
  branchName?: string | null;
  parentScoreId?: string | null;
}): ScoreDocument {
  const id =
    options?.id ??
    `score-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    version: 1,
    ppq: INTERNAL_PPQ,
    tempoMap: [{ tick: 0, quarterBpm: options?.tempoBpm ?? 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, tonic: "C", mode: "major" }],
    sections: [],
    voices: [
      {
        id: "voice-0",
        name: "Vocal",
        role: "vocal",
        notes: [],
        abcVoice: "Vocal",
      },
    ],
    chordEvents: [],
    lyricAnchors: [],
    source: "manual",
    parentScoreId: options?.parentScoreId ?? null,
    branchName: options?.branchName ?? "main",
  };
}

export function forkScoreBranch(
  doc: ScoreDocument,
  branchName: string,
): ScoreDocument {
  return {
    ...doc,
    id: `score-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    version: doc.version + 1,
    parentScoreId: doc.id,
    branchName: branchName.trim() || "branch",
    source: "manual",
  };
}

export function updateScoreKey(
  doc: ScoreDocument,
  tonic: string,
  mode: ModeName,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    keySignatures: [{ tick: 0, tonic, mode }],
  };
}

export function updateScoreMeter(
  doc: ScoreDocument,
  numerator: number,
  denominator: number,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    timeSignatures: [
      {
        tick: 0,
        numerator: Math.max(1, Math.round(numerator)),
        denominator: Math.max(1, Math.round(denominator)),
      },
    ],
  };
}

export function upsertChord(
  doc: ScoreDocument,
  tick: number,
  symbol: string,
): { doc: ScoreDocument; error: string | null } {
  const refusal = validateChordSymbol(symbol);
  if (refusal) return { doc, error: refusal };
  const others = doc.chordEvents.filter((c) => c.tick !== tick);
  return {
    doc: {
      ...doc,
      version: doc.version + 1,
      chordEvents: [...others, { tick, symbol }].sort((a, b) => a.tick - b.tick),
    },
    error: null,
  };
}

export function removeChord(doc: ScoreDocument, tick: number): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    chordEvents: doc.chordEvents.filter((c) => c.tick !== tick),
  };
}

export function setVoiceAbcRole(
  doc: ScoreDocument,
  voiceId: string,
  abcVoice: AbcVoiceTarget,
  role?: ScoreVoiceRole,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    voices: doc.voices.map((v) => {
      if (v.id !== voiceId) return v;
      return {
        ...v,
        abcVoice,
        ...(role ? { role } : {}),
      };
    }),
  };
}

export function validateScoreForGeneration(
  doc: ScoreDocument,
  cot: CotProfile,
): { ok: boolean; issues: ScoreIssue[] } {
  return validateForAbcExport(doc, { cot });
}

export function exportScoreAbc(
  doc: ScoreDocument,
  cot: Exclude<CotProfile, "off">,
  title?: string,
): { abc: string; warnings: string[] } {
  const result = exportToYuE2Abc(doc, { cot, title });
  return { abc: result.abc, warnings: result.warnings };
}

export function vocalToInsAbc(abc: string): {
  abc: string;
  movedNoteCount: number;
} {
  return convertVocalToIns(abc);
}

export function updateScoreTempo(
  doc: ScoreDocument,
  quarterBpm: number,
): ScoreDocument {
  const bpm = Math.max(1, Math.round(quarterBpm));
  return {
    ...doc,
    version: doc.version + 1,
    tempoMap: [{ tick: 0, quarterBpm: bpm }],
  };
}

export function upsertSection(
  doc: ScoreDocument,
  section: SongSection,
): ScoreDocument {
  const others = doc.sections.filter((s) => s.id !== section.id);
  return {
    ...doc,
    version: doc.version + 1,
    sections: [...others, section].sort((a, b) => a.startTick - b.startTick),
  };
}

export function removeSection(
  doc: ScoreDocument,
  sectionId: string,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    sections: doc.sections.filter((s) => s.id !== sectionId),
  };
}

export function updateNote(
  doc: ScoreDocument,
  voiceId: string,
  noteId: string,
  patch: Partial<{
    startTick: number;
    durationTick: number;
    pitch: number;
    velocity: number;
  }>,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    source: doc.source === "midi" ? "manual" : doc.source,
    voices: doc.voices.map((v) => {
      if (v.id !== voiceId) return v;
      return {
        ...v,
        notes: v.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
      };
    }),
  };
}

export function addNote(
  doc: ScoreDocument,
  voiceId: string,
  note: {
    id: string;
    startTick: number;
    durationTick: number;
    pitch: number;
    velocity: number;
  },
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    source: "manual",
    voices: doc.voices.map((v) => {
      if (v.id !== voiceId) return v;
      return { ...v, notes: [...v.notes, note] };
    }),
  };
}

export function deleteNote(
  doc: ScoreDocument,
  voiceId: string,
  noteId: string,
): ScoreDocument {
  return {
    ...doc,
    version: doc.version + 1,
    source: "manual",
    voices: doc.voices.map((v) => {
      if (v.id !== voiceId) return v;
      return { ...v, notes: v.notes.filter((n) => n.id !== noteId) };
    }),
  };
}

export function primaryVoiceId(doc: ScoreDocument): string | null {
  const vocal = doc.voices.find(
    (v) =>
      v.abcVoice === "Vocal" ||
      (!v.abcVoice && (v.role === "vocal" || v.role === "melody")),
  );
  return vocal?.id ?? doc.voices[0]?.id ?? null;
}

/** Prepare ABC for generation, or null when no user score (phase 1 path). */
export function prepareAbcForGeneration(
  document: ScoreDocument | null,
  cot: string,
  title: string,
): { abc: string | null; error: string | null; issues: ScoreIssue[] } {
  if (!document) {
    return { abc: null, error: null, issues: [] };
  }
  if (cot === "off") {
    return {
      abc: null,
      error: "Un ABC avec cot=off est interdit.",
      issues: [],
    };
  }
  if (cot !== "full" && cot !== "melody") {
    return {
      abc: null,
      error: "Partition invalide pour l’export ABC YuE2.",
      issues: [],
    };
  }
  const check = validateScoreForGeneration(document, cot);
  if (!check.ok) {
    return {
      abc: null,
      error: check.issues[0]?.message ?? "Partition invalide pour l’export ABC YuE2.",
      issues: check.issues,
    };
  }
  try {
    const { abc } = exportScoreAbc(document, cot, title || undefined);
    return { abc, error: null, issues: check.issues };
  } catch (e) {
    return { abc: null, error: String(e), issues: [] };
  }
}
