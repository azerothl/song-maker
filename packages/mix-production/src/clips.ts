import { dbToLinear } from "./dsp.js";
import {
  clampPitchSemitones,
  processClipRegion,
  resolveClipStretchRatio,
} from "./timeStretch.js";

export type ClipPlacement = {
  startMs: number;
  offsetMs: number;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  /** When false, clip is kept on the track but not rendered (take lane). */
  takeActive?: boolean;
  processingEnabled?: boolean;
  followProjectTempo?: boolean;
  sourceTempoBpm?: number | null;
  timeStretchRatio?: number | null;
  pitchSemitones?: number | null;
};

export type PlaceClipsOptions = {
  /** Project / mix tempo for followProjectTempo clips. */
  projectTempoBpm?: number | null;
};

function msToSamples(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms / 1000) * sampleRate));
}

function fadeGain(
  i: number,
  dur: number,
  fadeIn: number,
  fadeOut: number,
): number {
  let g = 1;
  if (fadeIn > 0 && i < fadeIn) {
    g = i / fadeIn;
  }
  if (fadeOut > 0 && i >= dur - fadeOut) {
    g = Math.min(g, (dur - 1 - i) / fadeOut);
  }
  return Math.max(0, Math.min(1, g));
}

/**
 * Place source planar audio onto a timeline (start / offset / duration / fades).
 * Optional per-clip time-stretch (pitch preserved) + transpose.
 * Mirrors the Rust `render_clip_onto` layout for unprocessed clips so bake ≈ export.
 */
export function placeClipsOnTimeline(
  srcLeft: Float32Array,
  srcRight: Float32Array,
  clips: readonly ClipPlacement[],
  sampleRate: number,
  options?: PlaceClipsOptions,
): { left: Float32Array; right: Float32Array; frameCount: number } {
  let maxEnd = 1;
  for (const clip of clips) {
    if (clip.durationMs <= 0) continue;
    if (clip.takeActive === false) continue;
    maxEnd = Math.max(
      maxEnd,
      msToSamples(clip.startMs + clip.durationMs, sampleRate),
    );
  }
  const left = new Float32Array(maxEnd);
  const right = new Float32Array(maxEnd);

  for (const clip of clips) {
    if (clip.durationMs <= 0) continue;
    if (clip.takeActive === false) continue;
    const start = msToSamples(clip.startMs, sampleRate);
    const offset = msToSamples(clip.offsetMs, sampleRate);
    const dur = Math.max(1, msToSamples(clip.durationMs, sampleRate));
    const fadeIn = Math.min(dur, msToSamples(clip.fadeInMs, sampleRate));
    const fadeOut = Math.min(
      dur - fadeIn,
      msToSamples(clip.fadeOutMs, sampleRate),
    );
    const lin = dbToLinear(clip.gainDb);

    const stretch = resolveClipStretchRatio({
      ...(clip.processingEnabled !== undefined
        ? { processingEnabled: clip.processingEnabled }
        : {}),
      ...(clip.followProjectTempo !== undefined
        ? { followProjectTempo: clip.followProjectTempo }
        : {}),
      ...(clip.sourceTempoBpm !== undefined
        ? { sourceTempoBpm: clip.sourceTempoBpm }
        : {}),
      ...(options?.projectTempoBpm !== undefined
        ? { projectTempoBpm: options.projectTempoBpm }
        : {}),
      ...(clip.timeStretchRatio !== undefined
        ? { timeStretchRatio: clip.timeStretchRatio }
        : {}),
    });
    const pitch =
      clip.processingEnabled === false
        ? 0
        : clampPitchSemitones(clip.pitchSemitones ?? 0);
    const needsProcess =
      clip.processingEnabled !== false &&
      (Math.abs(stretch - 1) >= 1e-4 || Math.abs(pitch) >= 1e-4);

    if (!needsProcess) {
      for (let i = 0; i < dur; i++) {
        const outIdx = start + i;
        if (outIdx >= maxEnd) break;
        const srcIdx = offset + i;
        const fade = fadeGain(i, dur, fadeIn, fadeOut);
        left[outIdx]! += (srcLeft[srcIdx] ?? 0) * lin * fade;
        right[outIdx]! += (srcRight[srcIdx] ?? 0) * lin * fade;
      }
      continue;
    }

    // durationMs is timeline length; source region = timeline / stretch.
    const sourceFrames = Math.max(1, Math.round(dur / stretch));
    const processed = processClipRegion(
      srcLeft,
      srcRight,
      offset,
      sourceFrames,
      {
        timeStretchRatio: stretch,
        pitchSemitones: pitch,
        enabled: true,
      },
      sampleRate,
    );
    for (let i = 0; i < dur; i++) {
      const outIdx = start + i;
      if (outIdx >= maxEnd) break;
      const fade = fadeGain(i, dur, fadeIn, fadeOut);
      // Processed buffer may differ slightly from dur; sample by index clamp.
      const srcIdx = Math.min(i, processed.left.length - 1);
      left[outIdx]! += (processed.left[srcIdx] ?? 0) * lin * fade;
      right[outIdx]! += (processed.right[srcIdx] ?? 0) * lin * fade;
    }
  }
  return { left, right, frameCount: maxEnd };
}
