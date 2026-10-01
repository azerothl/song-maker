import { createClipEditor } from "@song-maker/score-engine";
import type { MixClip, MixDoc, MixTrack } from "./types";

export function applyClipFadeEdit(
  mix: MixDoc,
  trackId: string,
  clipId: string,
  patch: { fadeInMs?: number; fadeOutMs?: number },
): MixDoc {
  const editor = createClipEditor();
  const tracks = mix.tracks.map((tr) => {
    if (tr.id !== trackId) return tr;
    const nextClips = editor.apply(tr.clips as MixClip[], {
      kind: "fade",
      clipId,
      fadeInMs: patch.fadeInMs,
      fadeOutMs: patch.fadeOutMs,
    });
    return { ...tr, clips: nextClips };
  });
  return { ...mix, tracks };
}

export function findClipOnTrack(
  track: MixTrack,
  clipId: string,
): MixClip | undefined {
  return track.clips.find((c) => c.id === clipId);
}
