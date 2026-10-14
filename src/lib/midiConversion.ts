import type { ScoreDocument } from "./score";
import { float32ToLeBytes } from "./mixBridge";
import { processTrackVst3Effects } from "./exportMix";
import { renderMidiMixStems } from "./midiMixRender";
import type { MixDoc, MixTrack } from "./types";

const RENDER_SAMPLE_RATE = 48_000;

/** Render one arrangement MIDI lane with its assigned instrument and audio inserts. */
export async function renderMidiTrackToPcm(
  mix: MixDoc,
  score: ScoreDocument,
  trackId: string,
): Promise<number[]> {
  const track = mix.tracks.find(candidate => candidate.id === trackId);
  const voice = score.voices.find(candidate => candidate.id === trackId);
  if (!track || track.role.toLowerCase() !== "midi" || !voice?.notes.length) {
    throw new Error("Cette piste MIDI ne contient aucune note à rendre.");
  }

  // Native project audio assets use the application's fixed 48 kHz rate.
  const renderTrack: MixTrack = { ...track, mute: false, solo: false };
  const renderMix = { ...mix, sampleRate: RENDER_SAMPLE_RATE, tracks: [renderTrack] };
  const renderScore = { ...score, voices: [voice] };
  const [rawStem] = await renderMidiMixStems(renderMix, renderScore);
  if (!rawStem?.left.length) throw new Error("Le rendu de la piste MIDI n’a produit aucun audio.");
  const [stem] = await processTrackVst3Effects(renderMix, [rawStem]);
  const frames = Math.min(stem.left.length, stem.right.length);
  if (!frames || frames * 8 > 512 * 1024 * 1024) {
    throw new Error("Le rendu audio de cette piste dépasse la taille autorisée.");
  }
  const interleaved = new Float32Array(frames * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    interleaved[frame * 2] = stem.left[frame] ?? 0;
    interleaved[frame * 2 + 1] = stem.right[frame] ?? 0;
  }
  return float32ToLeBytes(interleaved);
}
