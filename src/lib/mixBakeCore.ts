import {
  placeClipsOnTimeline,
  renderMixOffline,
  resolveClipStretchRatio,
  type MixBus,
  type MixProductionToolkit,
  type MixRenderResult,
  type MixSend,
} from "@song-maker/mix-production";
import type { MixClip, MixDoc } from "./types";

export type DecodedStem = {
  trackId: string;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
};

export type MixBakeRouting = {
  buses?: MixBus[];
  sends?: MixSend[];
  trackGroupIds?: Record<string, string | null | undefined>;
};

function clipPlacementFromMix(c: MixClip) {
  return {
    startMs: c.startMs,
    offsetMs: c.offsetMs,
    durationMs: c.durationMs,
    fadeInMs: c.fadeInMs,
    fadeOutMs: c.fadeOutMs,
    gainDb: c.gainDb,
    takeActive: c.takeActive,
    processingEnabled: c.processingEnabled,
    followProjectTempo: c.followProjectTempo,
    sourceTempoBpm: c.sourceTempoBpm,
    timeStretchRatio: c.timeStretchRatio,
    pitchSemitones: c.pitchSemitones,
  };
}

/** True when clip placement needs the offline bake path (stretch / takes). */
export function mixNeedsClipProcessingBakeCore(
  mix: MixDoc | null | undefined,
  projectTempoBpm: number | null,
): boolean {
  if (!mix) return false;
  const projectTempo = mix.tempoMap?.[0]?.quarterBpm ?? projectTempoBpm;
  for (const track of mix.tracks) {
    for (const c of track.clips) {
      if (c.takeActive === false) return true;
      if (c.processingEnabled === false) continue;
      const stretch = resolveClipStretchRatio({
        ...(c.processingEnabled !== undefined
          ? { processingEnabled: c.processingEnabled }
          : {}),
        ...(c.followProjectTempo !== undefined
          ? { followProjectTempo: c.followProjectTempo }
          : {}),
        ...(c.sourceTempoBpm !== undefined
          ? { sourceTempoBpm: c.sourceTempoBpm }
          : {}),
        ...(projectTempo !== undefined
          ? { projectTempoBpm: projectTempo }
          : {}),
        ...(c.timeStretchRatio !== undefined
          ? { timeStretchRatio: c.timeStretchRatio }
          : {}),
      });
      if (Math.abs(stretch - 1) >= 1e-4) return true;
      if (Math.abs(c.pitchSemitones ?? 0) >= 1e-4) return true;
    }
  }
  return false;
}

/**
 * Shared bake: place clips → production DSP → §10.5 sum.
 * Pure function — no module globals (safe in Worker).
 */
export function bakeMixPcmCore(
  mix: MixDoc,
  stems: DecodedStem[],
  toolkit: MixProductionToolkit,
  routing: MixBakeRouting,
  options?: { tempoBpm?: number | null; projectTempoBpm?: number | null },
): MixRenderResult {
  const sampleRate = mix.sampleRate || stems[0]?.sampleRate || 48000;
  const projectTempo =
    options?.tempoBpm ??
    mix.tempoMap?.[0]?.quarterBpm ??
    options?.projectTempoBpm ??
    null;
  const byId = new Map(stems.map((s) => [s.trackId, s]));
  const tracks = mix.tracks.map((track) => {
    const src = byId.get(track.id);
    const empty = new Float32Array(1);
    const left = src?.left ?? empty;
    const right = src?.right ?? empty;
    const clips =
      track.clips.length > 0
        ? track.clips.map((c) => clipPlacementFromMix(c))
        : [
            {
              startMs: 0,
              offsetMs: 0,
              durationMs: Math.round((left.length / sampleRate) * 1000),
              fadeInMs: 0,
              fadeOutMs: 0,
              gainDb: 0,
            },
          ];
    const placed = placeClipsOnTimeline(left, right, clips, sampleRate, {
      projectTempoBpm: projectTempo,
    });
    return {
      trackId: track.id,
      left: placed.left,
      right: placed.right,
      gainDb: track.gainDb,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
    };
  });

  return renderMixOffline({
    mixId: mix.id,
    sampleRate,
    masterGainDb: mix.masterGainDb,
    peakCeilingDb: mix.peakCeilingDb,
    tracks,
    automation: toolkit.automation,
    effects: toolkit.effects,
    sidechain: toolkit.sidechain,
    tempoBpm: projectTempo,
    buses: routing.buses,
    sends: routing.sends,
    trackGroupIds: routing.trackGroupIds,
  });
}

export function pcmBuffersEqual(
  a: Float32Array,
  b: Float32Array,
  tolerance = 0,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > tolerance) return false;
  }
  return true;
}
