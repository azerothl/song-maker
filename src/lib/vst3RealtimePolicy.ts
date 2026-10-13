import type { ScoreDocument } from "@song-maker/score-engine";
import type { MixDoc, MixTrack } from "./types";

function hasEnabledEffect(track: MixTrack | undefined): boolean {
  return track?.vst3Effects?.some((effect) => effect.enabled) === true;
}

/**
 * Audio-track inserts can fall back to the offline stem renderer. MIDI inserts
 * are handled only by the persistent native engine and must never request a
 * stem bake.
 */
export function needsOfflineTrackVst3Bake(
  mix: MixDoc,
  nativeRealtimeReady: boolean,
): boolean {
  return (
    !nativeRealtimeReady &&
    mix.tracks.some(
      (track) => track.role.toLowerCase() !== "midi" && hasEnabledEffect(track),
    )
  );
}

/** True when a populated MIDI voice depends on the native VST3 engine. */
export function hasNativeMidiVst3Request(
  mix: MixDoc,
  score: ScoreDocument | null,
): boolean {
  if (!score) return false;
  const tracks = new Map(mix.tracks.map((track) => [track.id, track]));
  return score.voices.some(
    (voice) =>
      voice.notes.length > 0 &&
      (voice.vst3Instrument != null || hasEnabledEffect(tracks.get(voice.id))),
  );
}
