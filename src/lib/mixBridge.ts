import {
  convertFileSrc,
} from "@tauri-apps/api/core";
import {
  placeClipsOnTimeline,
  renderMixOffline,
  resolveClipStretchRatio,
  type MixProductionToolkit,
  type MixRenderResult,
} from "@song-maker/mix-production";
import type { MixClip, MixDoc, PlaybackSources } from "./types";
import {
  getProductionOverlay,
  getProductionTempoBpm,
  getProductionToolkit,
  productionIsActive,
} from "./productionState";

export type DecodedStem = {
  trackId: string;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
};

/** True when clip placement needs the offline bake path (stretch / takes). */
export function mixNeedsClipProcessingBake(mix: MixDoc | null | undefined): boolean {
  if (!mix) return false;
  const projectTempo =
    mix.tempoMap?.[0]?.quarterBpm ?? getProductionTempoBpm();
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

async function decodeStemFile(
  ctx: AudioContext,
  absolutePath: string,
): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number }> {
  const url = convertFileSrc(absolutePath);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Lecture stem impossible (${resp.status}).`);
  }
  const bytes = await resp.arrayBuffer();
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  const left = new Float32Array(buffer.getChannelData(0));
  const right =
    buffer.numberOfChannels > 1
      ? new Float32Array(buffer.getChannelData(1))
      : new Float32Array(left);
  return { left, right, sampleRate: buffer.sampleRate };
}

/** Decode all stems for a mix (paths from playback_sources). */
export async function decodeMixStems(
  sources: PlaybackSources,
  mix: MixDoc,
): Promise<{ stems: DecodedStem[]; sampleRate: number }> {
  if (sources.mode !== "stems" || sources.stems.length === 0) {
    throw new Error("Pas de stems à mixer.");
  }
  const ctx = new AudioContext();
  try {
    const stems: DecodedStem[] = [];
    let sampleRate = mix.sampleRate || 48000;
    for (const stem of sources.stems) {
      const decoded = await decodeStemFile(ctx, stem.path);
      sampleRate = decoded.sampleRate;
      stems.push({
        trackId: stem.trackId,
        left: decoded.left,
        right: decoded.right,
        sampleRate: decoded.sampleRate,
      });
    }
    return { stems, sampleRate };
  } finally {
    await ctx.close();
  }
}

/**
 * Shared bake: place clips → production DSP → §10.5 sum.
 * Used by Web Audio playback (baked buffer) and offline export.
 */
export function bakeMixPcm(
  mix: MixDoc,
  stems: DecodedStem[],
  toolkit: MixProductionToolkit = getProductionToolkit(),
  options?: { tempoBpm?: number | null },
): MixRenderResult {
  const sampleRate = mix.sampleRate || stems[0]?.sampleRate || 48000;
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
      projectTempoBpm:
        options?.tempoBpm ??
        mix.tempoMap?.[0]?.quarterBpm ??
        getProductionTempoBpm(),
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
    tempoBpm: options?.tempoBpm ?? getProductionTempoBpm(),
    buses: getProductionOverlay()?.buses,
    sends: getProductionOverlay()?.sends,
    trackGroupIds: getProductionOverlay()?.trackGroupIds,
  });
}

export function float32ToLeBytes(pcm: Float32Array): number[] {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return Array.from(bytes);
}

export function shouldUseProductionExport(): boolean {
  return productionIsActive();
}
