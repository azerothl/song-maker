import { INTERNAL_PPQ, type ScoreDocument, type ScoreVoice } from "@song-maker/score-engine";
import type { MixDoc, MixTrack } from "./types";
import { scoreSecondsToTicks, scoreTicksToSeconds } from "./scoreTiming";
import { resolveClipStretchRatio } from "@song-maker/mix-production";

export type StudioAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type StudioAssistantUndoRecord = {
  beforeMix: MixDoc;
  beforeScore: ScoreDocument | null;
  addedMidiTrackId?: string;
  afterFingerprint: string;
  /** Recovery snapshot written atomically with the arrangement before the UI saves its fingerprint. */
  afterMix?: MixDoc;
  afterScore?: ScoreDocument | null;
};
export type StudioAssistantHistory = {
  messages: StudioAssistantMessage[];
  undoRecords?: StudioAssistantUndoRecord[];
};

// Ignore storage/version metadata, but retain every musical and mixer setting.
// A stale undo must never overwrite edits made in another Studio screen.
export function assistantStateFingerprint(mix: MixDoc | null, score: ScoreDocument | null): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, canonical(entry)]));
    }
    return value;
  };
  const music = score ? { ...score, id: undefined, version: undefined, createdAt: undefined,
    updatedAt: undefined, parentScoreId: undefined, branchName: undefined, schema: undefined, schemaVersion: undefined } : null;
  const arrangement = mix ? { ...mix, id: undefined, schema: undefined, schemaVersion: undefined } : null;
  return JSON.stringify(canonical({ mix: arrangement, score: music }));
}

export type StudioAssistantMidiAction = {
  type: "addMidiTrack";
  voice: ScoreVoice;
  sourceVoiceId?: string;
  sourceTrackId?: string;
};

export type StudioAssistantIntent = "beat" | "piano" | "mix" | "unknown";

export function detectStudioAssistantIntent(text: string): StudioAssistantIntent {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(beat|batterie|drum|percussion|percu)\b/.test(normalized)) return "beat";
  if (/\b(piano|pian[o]?|melodie|melody|ligne melodique)\b/.test(normalized)) return "piano";
  if (/\b(mix|volume|gain|pan|panoramique|basse|voix|instrument|son)\b/.test(normalized)) return "mix";
  return "unknown";
}

export function audioSourceTracks(mix: MixDoc): MixTrack[] {
  return mix.tracks.filter((track) => track.role !== "midi" && track.clips.length > 0);
}

export function usableMelodyVoices(document: ScoreDocument | null): ScoreVoice[] {
  return (document?.voices ?? []).filter(
    (voice) => voice.notes.length > 0 && voice.instrumentProgram !== "drums",
  );
}

/** Map a transcription of the source file to its edited placement in the arrangement. */
export function placeTranscribedMelody(
  source: ScoreVoice, sourceScore: ScoreDocument, targetScore: ScoreDocument, track: MixTrack,
): ScoreVoice {
  const clips = track.clips.filter(clip => clip.takeActive !== false);
  const sourcePath = clips.find(clip => clip.sourcePath)?.sourcePath;
  if (clips.some(clip => clip.sourcePath && clip.sourcePath !== sourcePath)) {
    throw new Error("Cette piste contient plusieurs fichiers audio. Choisissez une piste avec une seule source pour la transcription.");
  }
  const notes: ScoreVoice["notes"] = [];
  for (const [clipIndex, clip] of clips.entries()) {
    const ratio = resolveClipStretchRatio({ ...clip, projectTempoBpm: targetScore.tempoMap[0]?.quarterBpm ?? 120 });
    const sourceStart = clip.offsetMs / 1000;
    const sourceEnd = sourceStart + clip.durationMs / 1000 / ratio;
    for (const note of source.notes) {
      const start = Math.max(sourceStart, scoreTicksToSeconds(sourceScore, note.startTick));
      const end = Math.min(sourceEnd, scoreTicksToSeconds(sourceScore, note.startTick + note.durationTick));
      if (end <= start) continue;
      const startTick = scoreSecondsToTicks(targetScore, clip.startMs / 1000 + (start - sourceStart) * ratio);
      const endTick = scoreSecondsToTicks(targetScore, clip.startMs / 1000 + (end - sourceStart) * ratio);
      notes.push({ ...note, id: `${note.id}-clip-${clipIndex}`, startTick, durationTick: Math.max(1, endTick - startTick),
        pitch: Math.max(0, Math.min(127, note.pitch + (clip.processingEnabled === false ? 0 : clip.pitchSemitones ?? 0))) });
    }
  }
  return { ...source, notes: notes.sort((a, b) => a.startTick - b.startTick) };
}

export function makeRegularBeatVoice(
  name: string,
  meter: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 },
): ScoreVoice {
  const voiceId = `midi-assistant-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const numerator = Number.isInteger(meter.numerator) ? Math.max(1, Math.min(16, meter.numerator)) : 4;
  const denominator = [1, 2, 4, 8, 16].includes(meter.denominator) ? meter.denominator : 4;
  const beatTicks = (INTERNAL_PPQ * 4) / denominator;
  const eighthTicks = beatTicks / 2;
  const barTicks = beatTicks * numerator;
  const notes: ScoreVoice["notes"] = [];
  for (let bar = 0; bar < 4; bar += 1) {
    for (let beat = 0; beat < numerator; beat += 1) {
      const tick = bar * barTicks + beat * beatTicks;
      notes.push({
        id: `${voiceId}-kick-snare-${bar}-${beat}`,
        startTick: tick,
        durationTick: Math.max(1, Math.round(beatTicks / 4)),
        pitch: beat % 2 === 0 ? 36 : 38,
        velocity: beat === 0 ? 112 : beat % 2 === 0 ? 92 : 100,
      });
      for (const eighth of [0, 1]) {
        notes.push({
          id: `${voiceId}-hat-${bar}-${beat}-${eighth}`,
          startTick: tick + eighth * eighthTicks,
          durationTick: Math.max(1, Math.round(eighthTicks / 2)),
          pitch: 42,
          velocity: eighth === 0 ? 72 : 58,
        });
      }
    }
  }
  return {
    id: voiceId,
    name,
    role: "other",
    instrumentProgram: "drums",
    notes,
    abcVoice: "Ins",
  };
}
export function makePianoFollowVoice(
  source: ScoreVoice,
  name: string,
): ScoreVoice {
  return {
    id: `midi-assistant-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    name,
    role: "accompaniment",
    instrumentProgram: "piano",
    abcVoice: "Ins",
    notes: source.notes.map((note, index) => ({
      id: `assistant-piano-${index}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      startTick: note.startTick,
      durationTick: note.durationTick,
      pitch: note.pitch,
      velocity: Math.max(40, Math.min(92, Math.round(note.velocity * 0.78))),
    })),
  };
}

export function validateStudioAssistantMidiAction(
  action: StudioAssistantMidiAction,
  mix: MixDoc,
): void {
  const voice = action.voice;
  if (
    action.type !== "addMidiTrack" ||
    !voice.id.startsWith("midi-assistant-") ||
    !voice.name.trim() ||
    voice.name.length > 80 ||
    !["piano", "drums"].includes(voice.instrumentProgram ?? "") ||
    voice.notes.length === 0 ||
    voice.notes.length > 4096
  ) {
    throw new Error("Proposition MIDI invalide.");
  }
  if (mix.tracks.some((track) => track.id === voice.id)) {
    throw new Error("Une piste porte déjà cet identifiant.");
  }
  for (const note of voice.notes) {
    if (
      !Number.isInteger(note.startTick) ||
      note.startTick < 0 ||
      !Number.isInteger(note.durationTick) ||
      note.durationTick < 1 ||
      !Number.isInteger(note.pitch) ||
      note.pitch < 0 || note.pitch > 127 ||
      !Number.isInteger(note.velocity) ||
      note.velocity < 1 || note.velocity > 127
    ) {
      throw new Error("La proposition contient des notes MIDI hors limites.");
    }
  }
}

export function withAssistantVoice(
  document: ScoreDocument,
  voice: ScoreVoice,
): ScoreDocument {
  return {
    ...document,
    version: document.version + 1,
    voices: [...document.voices, voice],
    source: "manual",
  };
}
