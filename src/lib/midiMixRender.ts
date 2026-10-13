import type { ScoreDocument, ScoreVoice } from "@song-maker/score-engine";
import { api } from "./api";
import { INSTRUMENT_PROGRAMS, SoftSynth, type InstrumentProgram } from "./midiInstrument";
import type { DecodedStem } from "./mixBakeCore";
import { scoreTicksToSeconds } from "./scoreTiming";
import type { MixDoc } from "./types";

/** Only voices linked to an arrangement track are mixed, preventing a score draft
 * or a transcription reference from sounding a second time beside the source. */
export function arrangementMidiVoices(mix: MixDoc | null, score: ScoreDocument | null): ScoreVoice[] {
  if (!mix || !score) return [];
  const ids = new Set(mix.tracks.filter(track => track.role.toLowerCase() === "midi").map(track => track.id));
  return score.voices.filter(voice => ids.has(voice.id) && voice.notes.length > 0);
}

export function hasArrangementMidi(mix: MixDoc | null, score: ScoreDocument | null): boolean {
  return arrangementMidiVoices(mix, score).length > 0;
}

export function planarPcm(bytes: number[], trackId: string, sampleRate: number): DecodedStem {
  if (!bytes.length || bytes.length % 8 !== 0) throw new Error("Audio MIDI stéréo invalide.");
  const data = Uint8Array.from(bytes);
  const view = new DataView(data.buffer);
  const left = new Float32Array(data.length / 8);
  const right = new Float32Array(left.length);
  for (let frame = 0; frame < left.length; frame += 1) {
    left[frame] = view.getFloat32(frame * 8, true);
    right[frame] = view.getFloat32(frame * 8 + 4, true);
    if (!Number.isFinite(left[frame]) || !Number.isFinite(right[frame])) throw new Error("Audio MIDI non valide.");
  }
  return { trackId, left, right, sampleRate };
}

export async function renderMidiMixStems(mix: MixDoc, score: ScoreDocument | null): Promise<DecodedStem[]> {
  if (!score) return [];
  const sampleRate = mix.sampleRate || 48_000;
  const result: DecodedStem[] = [];
  for (const voice of arrangementMidiVoices(mix, score)) {
    const notes = voice.notes.map(note => ({
      startFrame: Math.max(0, Math.round(scoreTicksToSeconds(score, note.startTick) * sampleRate)),
      endFrame: Math.max(1, Math.round(scoreTicksToSeconds(score, note.startTick + note.durationTick) * sampleRate)),
      pitch: note.pitch, velocity: note.velocity,
    }));
    const frames = notes.reduce((end, note) => Math.max(end, note.endFrame), 0) + Math.ceil(sampleRate * 0.2);
    if (!Number.isSafeInteger(frames) || frames <= 0 || frames * 8 > 512 * 1024 * 1024) {
      throw new Error("La piste MIDI est trop longue pour ce rendu.");
    }
    if (voice.vst3Instrument) {
      const instrument = voice.vst3Instrument;
      const pcm = await api.vst3RenderMidiPcm({
        pluginPath: instrument.pluginPath, parameters: instrument.parameters,
        pluginStateB64: instrument.stateB64, sampleRate, renderFrames: frames, midiNotes: notes,
      });
      result.push(planarPcm(pcm, voice.id, sampleRate));
    } else {
      const context = new OfflineAudioContext(2, frames, sampleRate);
      const synth = new SoftSynth({ context, latencySec: 0 });
      const program = voice.instrumentProgram ?? "piano";
      if (!INSTRUMENT_PROGRAMS.includes(program as InstrumentProgram)) throw new Error("Instrument MIDI non pris en charge.");
      synth.setProgram(program as InstrumentProgram);
      for (const note of [...notes].sort((a, b) => a.startFrame - b.startFrame)) {
        await synth.noteOn(note.pitch, note.velocity, note.startFrame / sampleRate);
        synth.noteOff(note.pitch, note.endFrame / sampleRate);
      }
      const buffer = await context.startRendering();
      result.push({trackId: voice.id, left: new Float32Array(buffer.getChannelData(0)), right: new Float32Array(buffer.getChannelData(1)), sampleRate});
      await synth.dispose();
    }
  }
  return result;
}
