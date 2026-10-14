import { createEmptyScoreDocument, type ScoreDocument } from "./score";
import { scoreSecondsToTicks, scoreTicksToSeconds } from "./scoreTiming";
import type { MixDoc, MixTrack } from "./types";

export type ExtractionMode = "voice" | "bass" | "polyphonic";
export type ExtractionOptions = {
  mode: ExtractionMode;
  sensitivity: "conservative" | "balanced" | "detailed";
  minimumPitch: number;
  maximumPitch: number;
  minimumNoteMs: number;
  clipId: string | null;
};
export type ExtractionResult = {
  midiBytes: number[];
  noteCount: number;
  backend: string;
  tensorflowInstalled: boolean;
  model: string;
  previewId: string;
  sourceAudioPath: string;
  notes: { startSeconds: number; endSeconds: number; pitch: number; velocity: number }[];
  tempoBpm: number;
  tempoMap: MixDoc["tempoMap"];
  timeSignatures: MixDoc["timeSignatures"];
  options: ExtractionOptions;
  durationSeconds: number;
};

export function extractionOptionsForMode(mode: ExtractionMode): ExtractionOptions {
  const [minimumPitch, maximumPitch] = mode === "voice" ? [36, 96] : mode === "bass" ? [23, 72] : [21, 108];
  return { mode, sensitivity: "balanced", minimumPitch, maximumPitch, minimumNoteMs: 127.7, clipId: null };
}

export function defaultExtractionOptions(track: MixTrack, clipId: string | null = null): ExtractionOptions {
  const role = track.role.trim().toLowerCase();
  const mode = ["voice", "vocal", "vocals", "voix"].includes(role) ? "voice"
    : ["bass", "basse"].includes(role) ? "bass" : "polyphonic";
  return { ...extractionOptionsForMode(mode), clipId };
}

export function extractedScore(result: ExtractionResult, track: MixTrack): ScoreDocument {
  const doc = createEmptyScoreDocument({ tempoBpm: result.tempoBpm, branchName: "extraction" });
  // The native result uses absolute arrangement seconds; rebuild its musical map
  // before converting notes (MIDI's constant-tempo fallback is not authoritative).
  for (const event of (result.tempoMap ?? []).slice().sort((a, b) => a.startMs - b.startMs)) {
    if (event.startMs < 0 || event.quarterBpm <= 0) continue;
    const tick = scoreSecondsToTicks(doc, event.startMs / 1000);
    doc.tempoMap = [...doc.tempoMap.filter(current => current.tick !== tick), { tick, quarterBpm: event.quarterBpm }];
  }
  const signatures = result.timeSignatures ?? [];
  if (signatures.length) {
    doc.timeSignatures = signatures.slice().sort((a, b) => a.startMs - b.startMs).map(event => ({
      tick: scoreSecondsToTicks(doc, event.startMs / 1000), numerator: event.numerator, denominator: event.denominator,
    }));
    if (doc.timeSignatures[0].tick !== 0) doc.timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 });
  }
  doc.source = "midi";
  doc.voices = [{ id: `extracted-${track.id}`, name: track.name,
    audioSourceTrackId: track.id,
    role: result.options.mode === "voice" ? "vocal" : result.options.mode === "bass" ? "bass" : "accompaniment",
    abcVoice: result.options.mode === "voice" ? "Vocal" : "Ins",
    instrumentProgram: result.options.mode === "bass" ? "bass" : "piano",
    notes: result.notes.map((note, index) => {
      const startTick = scoreSecondsToTicks(doc, note.startSeconds);
      const endTick = scoreSecondsToTicks(doc, note.endSeconds);
      return { id: `extracted-${result.previewId}-${index}`, startTick, durationTick: Math.max(1, endTick - startTick),
        pitch: note.pitch, velocity: note.velocity };
    }),
  }];
  doc.noteExtraction = { ...result.options, trackId: track.id, previousScoreId: null };
  return doc;
}

/** Replace only this track's earlier transcription; retain other score parts. */
export function mergeExtractedScore(before: ScoreDocument | null, draft: ScoreDocument, replaceVoiceId?: string | null): ScoreDocument {
  if (!before) return draft;
  const retime = (tick: number) => scoreSecondsToTicks(draft, scoreTicksToSeconds(before, tick));
  const retained = before.voices.filter(voice => voice.audioSourceTrackId !== draft.noteExtraction?.trackId && voice.id !== replaceVoiceId)
    .map(voice => ({ ...voice, notes: voice.notes.map(note => {
      const startTick = retime(note.startTick);
      return { ...note, startTick, durationTick: Math.max(1, retime(note.startTick + note.durationTick) - startTick) };
    }) }));
  const voices = [...retained, ...draft.voices];
  const noteIds = new Set(voices.flatMap(voice => voice.notes.map(note => note.id)));
  return { ...before, version: before.version + 1, source: "midi", tempoMap: draft.tempoMap,
    timeSignatures: draft.timeSignatures, voices,
    lyricAnchors: before.lyricAnchors.map(anchor => ({ ...anchor, noteIds: anchor.noteIds.filter(id => noteIds.has(id)) }))
      .filter(anchor => anchor.noteIds.length > 0),
    sections: before.sections.map(section => ({ ...section, startTick: retime(section.startTick) })),
    chordEvents: before.chordEvents.map(chord => ({ ...chord, tick: retime(chord.tick) })),
    keySignatures: before.keySignatures.map(key => ({ ...key, tick: retime(key.tick) })),
    noteExtraction: draft.noteExtraction };
}

/** Add an extracted voice as an editable, audible MIDI lane directly below its audio source. */
export function buildArrangementMidiConversion(
  mix: MixDoc,
  before: ScoreDocument | null,
  draft: ScoreDocument,
  sourceTrackId: string,
  replaceVoiceId: string | null,
): { mix: MixDoc; score: ScoreDocument; trackId: string } {
  const sourceIndex = mix.tracks.findIndex(track => track.id === sourceTrackId);
  const sourceTrack = mix.tracks[sourceIndex];
  if (!sourceTrack || sourceTrack.role.toLowerCase() === "midi") {
    throw new Error("La piste audio source n’est plus disponible dans l’arrangement.");
  }
  const extracted = draft.voices.find(voice => voice.audioSourceTrackId === sourceTrackId) ?? draft.voices[0];
  if (!extracted?.notes.length) throw new Error("Aucune note exploitable n’a été détectée.");
  if (extracted.notes.length > 4096) throw new Error("Cette extraction contient trop de notes pour une seule piste MIDI. Réduisez la zone ou choisissez une détection moins détaillée.");

  const existing = replaceVoiceId
    ? before?.voices.find(voice => voice.id === replaceVoiceId
      && voice.audioSourceTrackId === sourceTrackId
      && mix.tracks.some(track => track.id === voice.id && track.role.toLowerCase() === "midi"))
    : undefined;
  const trackId = existing?.id ?? `midi-assistant-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const name = `${sourceTrack.name.slice(0, 72).trim()} MIDI`;
  const scoreBase = before ?? createEmptyScoreDocument({
    tempoBpm: mix.tempoMap?.[0]?.quarterBpm ?? 120,
    branchName: "main",
  });
  const voice = {
    ...extracted,
    id: trackId,
    name,
    audioSourceTrackId: sourceTrackId,
    instrumentProgram: "piano" as const,
    notes: extracted.notes.map(note => {
      const startTick = scoreSecondsToTicks(scoreBase, scoreTicksToSeconds(draft, note.startTick));
      const endTick = scoreSecondsToTicks(scoreBase, scoreTicksToSeconds(draft, note.startTick + note.durationTick));
      return { ...note, startTick, durationTick: Math.max(1, endTick - startTick) };
    }),
  };
  const score: ScoreDocument = {
    ...scoreBase,
    version: scoreBase.version + 1,
    source: "midi",
    voices: [...scoreBase.voices.filter(current => current.id !== trackId), voice],
    noteExtraction: { ...draft.noteExtraction!, arrangementTrackId: trackId, arrangementSourceTrackId: sourceTrackId },
  };

  const existingTrack = mix.tracks.find(track => track.id === trackId);
  const midiTrack: MixTrack = existingTrack
    ? { ...existingTrack, role: "midi", name, clips: [] }
    : {
        id: trackId, role: "midi", name, gainDb: sourceTrack.gainDb, pan: sourceTrack.pan,
        mute: false, solo: sourceTrack.solo, locked: false, aiSeparated: false,
        clips: [], vst3Effects: [],
      };
  const tracks = mix.tracks.filter(track => track.id !== trackId);
  const adjustedSourceIndex = tracks.findIndex(track => track.id === sourceTrackId);
  if (adjustedSourceIndex < 0) throw new Error("La piste audio source n’est plus disponible dans l’arrangement.");
  tracks[adjustedSourceIndex] = { ...tracks[adjustedSourceIndex], mute: true, solo: false };
  tracks.splice(adjustedSourceIndex + 1, 0, midiTrack);
  return { mix: { ...mix, tracks }, score, trackId };
}
