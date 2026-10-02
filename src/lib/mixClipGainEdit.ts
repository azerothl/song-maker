import type { MixDoc } from "./types";

/** Bounds for MixClip.gainDb UI (#228 critère F, maquette −24…+12). */
export const CLIP_GAIN_DB_MIN = -24;
export const CLIP_GAIN_DB_MAX = 12;
/** Maquette / track strip step. */
export const CLIP_GAIN_DB_STEP = 0.5;

export function clampClipGainDb(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 0;
  const quantized =
    Math.round(gainDb / CLIP_GAIN_DB_STEP) * CLIP_GAIN_DB_STEP;
  return Math.min(
    CLIP_GAIN_DB_MAX,
    Math.max(CLIP_GAIN_DB_MIN, Number(quantized.toFixed(1))),
  );
}

/** Patch one clip's gainDb via the mix update path (undoable like other mix edits). */
export function applyClipGainEdit(
  mix: MixDoc,
  trackId: string,
  clipId: string,
  gainDb: number,
): MixDoc {
  const nextGain = clampClipGainDb(gainDb);
  return {
    ...mix,
    tracks: mix.tracks.map((tr) => {
      if (tr.id !== trackId) return tr;
      return {
        ...tr,
        clips: tr.clips.map((c) =>
          c.id === clipId ? { ...c, gainDb: nextGain } : c,
        ),
      };
    }),
  };
}
