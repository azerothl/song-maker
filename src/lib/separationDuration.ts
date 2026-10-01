import type { MixDoc, ProjectDoc } from "./types";

/**
 * Durée audio réelle pour estimer la séparation (#166) — pas de fallback 180 s.
 * Ordre : pistes mesurées → clips du mix → durée de lecture → durée projet → cible.
 */
export function separationAudioDurationSec(args: {
  project: ProjectDoc;
  mix: MixDoc | null;
  playbackDurationSec?: number | null;
  sourceDurationMsByTrack: Record<string, number>;
}): number {
  let maxMs = 0;
  for (const ms of Object.values(args.sourceDurationMsByTrack)) {
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms;
  }
  if (maxMs > 0) return maxMs / 1000;

  if (args.mix?.tracks?.length) {
    for (const track of args.mix.tracks) {
      for (const clip of track.clips) {
        const end = clip.startMs + clip.durationMs;
        if (end > maxMs) maxMs = end;
      }
    }
    if (maxMs > 0) return maxMs / 1000;
  }

  const playbackSec = args.playbackDurationSec;
  if (
    playbackSec != null &&
    Number.isFinite(playbackSec) &&
    playbackSec > 0
  ) {
    return playbackSec;
  }

  if (
    args.project.targetDurationSec != null &&
    args.project.targetDurationSec > 0
  ) {
    return args.project.targetDurationSec;
  }

  return 1;
}
