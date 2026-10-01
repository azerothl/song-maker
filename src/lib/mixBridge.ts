import {
  convertFileSrc,
} from "@tauri-apps/api/core";
import type { MixProductionToolkit, MixRenderResult } from "@song-maker/mix-production";
import type { MixDoc, PlaybackSources } from "./types";
import {
  bakeMixPcmCore,
  mixNeedsClipProcessingBakeCore,
  type DecodedStem,
  type MixBakeRouting,
} from "./mixBakeCore";
import {
  getProductionOverlay,
  getProductionTempoBpm,
  getProductionToolkit,
  productionIsActive,
} from "./productionState";

export type { DecodedStem };

/** True when clip placement needs the offline bake path (stretch / takes). */
export function mixNeedsClipProcessingBake(mix: MixDoc | null | undefined): boolean {
  return mixNeedsClipProcessingBakeCore(mix, getProductionTempoBpm());
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

function routingFromOverlay(): MixBakeRouting {
  const overlay = getProductionOverlay();
  return {
    buses: overlay?.buses,
    sends: overlay?.sends,
    trackGroupIds: overlay?.trackGroupIds,
  };
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
  const tempo = options?.tempoBpm ?? getProductionTempoBpm();
  return bakeMixPcmCore(mix, stems, toolkit, routingFromOverlay(), {
    tempoBpm: tempo,
    projectTempoBpm: tempo,
  });
}

export function float32ToLeBytes(pcm: Float32Array): number[] {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return Array.from(bytes);
}

export function shouldUseProductionExport(): boolean {
  return productionIsActive();
}
