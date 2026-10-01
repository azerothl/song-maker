import type { MixDoc, PlaybackSources } from "./types";

/** True when the project has audio that Export can render (generation or import). */
export function hasExportableAudio(
  mix: MixDoc | null | undefined,
  sources: PlaybackSources | null | undefined,
): boolean {
  if (sources?.generationWav) return true;
  if ((sources?.stems?.length ?? 0) > 0) return true;
  if (!mix?.tracks?.length) return false;
  return mix.tracks.some((tr) =>
    tr.clips.some(
      (clip) =>
        Boolean(clip.sourcePath) &&
        Number.isFinite(clip.durationMs) &&
        clip.durationMs > 0,
    ),
  );
}
