import {
  applyQuantization,
  convertVocalToIns,
  exportToYuE2Abc,
  importMidiToScoreDocument,
  validateForAbcExport,
  type CotProfile,
  type MidiImportResult,
  type ScoreDocument,
  type ScoreIssue,
  type SongSection,
  type SectionKind,
} from "@song-maker/score-engine";

export type {
  CotProfile,
  MidiImportResult,
  ScoreDocument,
  ScoreIssue,
  SongSection,
  SectionKind,
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

