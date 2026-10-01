import type { MixDoc, MixTrack } from "./types";

function uniqueEmptyTrackName(mix: MixDoc, base: string): string {
  let candidate = base;
  let n = 2;
  while (mix.tracks.some((tr) => tr.name === candidate)) {
    candidate = `${base} (${n})`;
    n += 1;
  }
  return candidate;
}

/** Append an empty user track (no clips) — menu « Ajouter une piste vide » (#226). */
export function appendEmptyUserTrack(
  mix: MixDoc,
  displayName = "Piste vide",
): MixDoc {
  const track: MixTrack = {
    id: `trk-${crypto.randomUUID()}`,
    role: "user",
    name: uniqueEmptyTrackName(mix, displayName),
    gainDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    locked: false,
    aiSeparated: false,
    clips: [],
  };
  return { ...mix, tracks: [...mix.tracks, track] };
}
