/**
 * Aligned stem export helpers (#99).
 * Common origin at t=0 / bar 1, stable collision-free filenames, equal length.
 */

import { dbToLinear } from "./dsp.js";
import {
  interleavedToPlanar,
  renderMixOffline,
  type MixRenderInput,
  type MixRenderResult,
  type MixTrackRenderInput,
} from "./render.js";

export type StemExportFormat = "wav" | "flac";

export type StemExportTrack = {
  trackId: string;
  role: string;
  name: string;
};

export type AlignedStemBuffer = {
  trackId: string;
  role: string;
  name: string;
  /** Stable filename stem without extension (no path separators). */
  fileStem: string;
  /** Interleaved stereo float32, padded to shared frameCount from t=0. */
  pcm: Float32Array;
  frameCount: number;
  peakTrimDb: number;
};

export type AlignedStemsResult = {
  sampleRate: number;
  frameCount: number;
  stems: AlignedStemBuffer[];
  /** Master mix bake when requested (same origin / length). */
  master: MixRenderResult | null;
};

function sanitizeFilePart(raw: string): string {
  const s = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "track";
}

/**
 * Build stable, collision-free file stems from role + name + id.
 * Example: `01_vocals_Voix`, `02_drums_Batterie`.
 */
export function stableStemFileNames(
  tracks: StemExportTrack[],
): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  tracks.forEach((tr, index) => {
    const n = String(index + 1).padStart(2, "0");
    const base = `${n}_${sanitizeFilePart(tr.role)}_${sanitizeFilePart(tr.name)}`;
    let candidate = base;
    let i = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}_${i}`;
      i += 1;
    }
    used.add(candidate.toLowerCase());
    out.set(tr.trackId, candidate);
  });
  return out;
}

function padPlanarTo(
  left: Float32Array,
  right: Float32Array,
  frameCount: number,
): { left: Float32Array; right: Float32Array } {
  const L = new Float32Array(frameCount);
  const R = new Float32Array(frameCount);
  L.set(left.subarray(0, Math.min(left.length, frameCount)));
  R.set(right.subarray(0, Math.min(right.length, frameCount)));
  return { left: L, right: R };
}

function applyPeakCeiling(
  left: Float32Array,
  right: Float32Array,
  peakCeilingDb: number,
): { left: Float32Array; right: Float32Array; peakTrimDb: number } {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  const ceiling = dbToLinear(peakCeilingDb);
  let peakTrimDb = 0;
  const outL = new Float32Array(left);
  const outR = new Float32Array(right);
  if (peak > ceiling && peak > 0) {
    const trim = ceiling / peak;
    peakTrimDb = 20 * Math.log10(trim);
    for (let i = 0; i < outL.length; i++) {
      outL[i]! *= trim;
      outR[i]! *= trim;
    }
  }
  return { left: outL, right: outR, peakTrimDb };
}

function toInterleaved(left: Float32Array, right: Float32Array): Float32Array {
  const n = left.length;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = left[i] ?? 0;
    out[i * 2 + 1] = right[i] ?? 0;
  }
  return out;
}

export type BakeAlignedStemsInput = {
  mixId: string;
  sampleRate: number;
  masterGainDb: number;
  peakCeilingDb: number;
  /** Full mix track render inputs (already placed on timeline from t=0). */
  tracks: MixTrackRenderInput[];
  /** Meta for naming; must cover selected track ids. */
  trackMeta: StemExportTrack[];
  /** Track ids to export as stems (subset of tracks). */
  selectedTrackIds: string[];
  includeMaster?: boolean;
  automation?: MixRenderInput["automation"];
  effects?: MixRenderInput["effects"];
  sidechain?: MixRenderInput["sidechain"];
  buses?: MixRenderInput["buses"];
  sends?: MixRenderInput["sends"];
  trackGroupIds?: MixRenderInput["trackGroupIds"];
  tempoBpm?: number | null;
};

function toRenderInput(
  input: BakeAlignedStemsInput,
  tracks: MixTrackRenderInput[],
): MixRenderInput {
  const base: MixRenderInput = {
    mixId: input.mixId,
    sampleRate: input.sampleRate,
    masterGainDb: input.masterGainDb,
    peakCeilingDb: input.peakCeilingDb,
    tracks,
  };
  if (input.automation) base.automation = input.automation;
  if (input.effects) base.effects = input.effects;
  if (input.sidechain) base.sidechain = input.sidechain;
  if (input.buses) base.buses = input.buses;
  if (input.sends) base.sends = input.sends;
  if (input.trackGroupIds) base.trackGroupIds = input.trackGroupIds;
  if (input.tempoBpm != null) base.tempoBpm = input.tempoBpm;
  return base;
}

/**
 * Render selected stems and optional master, all zero-padded to the same
 * frame count from project origin (bar 1 / time 0).
 */
export function bakeAlignedStems(input: BakeAlignedStemsInput): AlignedStemsResult {
  const selected = new Set(input.selectedTrackIds);
  const metaById = new Map(input.trackMeta.map((t) => [t.trackId, t]));
  const namingTracks = input.trackMeta.filter((t) => selected.has(t.trackId));
  const names = stableStemFileNames(namingTracks);

  let maxLen = 0;
  for (const t of input.tracks) {
    maxLen = Math.max(maxLen, t.left.length, t.right.length);
  }

  const stems: AlignedStemBuffer[] = [];
  for (const track of input.tracks) {
    if (!selected.has(track.trackId)) continue;
    const meta = metaById.get(track.trackId);
    if (!meta) continue;

    // Solo this track through the shared renderer so FX/routing match the mix
    // path, then keep only that contribution length-aligned.
    const soloTracks = input.tracks.map((t) => ({
      ...t,
      solo: t.trackId === track.trackId,
      mute: t.trackId === track.trackId ? t.mute : true,
    }));
    const baked = renderMixOffline(toRenderInput(input, soloTracks));
    maxLen = Math.max(maxLen, baked.frameCount);
    const planar = interleavedToPlanar(baked.pcm, baked.frameCount);
    stems.push({
      trackId: track.trackId,
      role: meta.role,
      name: meta.name,
      fileStem: names.get(track.trackId) ?? sanitizeFilePart(meta.name),
      pcm: toInterleaved(planar.left, planar.right),
      frameCount: baked.frameCount,
      peakTrimDb: baked.peakTrimDb,
    });
  }

  // Second pass: pad every stem to the global max (common origin, equal length).
  const frameCount = Math.max(
    maxLen,
    ...stems.map((s) => s.frameCount),
    1,
  );
  const aligned = stems.map((s) => {
    const planar = interleavedToPlanar(s.pcm, s.frameCount);
    const padded = padPlanarTo(planar.left, planar.right, frameCount);
    const trimmed = applyPeakCeiling(
      padded.left,
      padded.right,
      input.peakCeilingDb,
    );
    return {
      ...s,
      pcm: toInterleaved(trimmed.left, trimmed.right),
      frameCount,
      peakTrimDb: trimmed.peakTrimDb,
    };
  });

  let master: MixRenderResult | null = null;
  if (input.includeMaster) {
    master = renderMixOffline(toRenderInput(input, input.tracks));
    if (master.frameCount < frameCount) {
      const planar = interleavedToPlanar(master.pcm, master.frameCount);
      const padded = padPlanarTo(planar.left, planar.right, frameCount);
      master = {
        ...master,
        left: padded.left,
        right: padded.right,
        pcm: toInterleaved(padded.left, padded.right),
        frameCount,
      };
    }
  }

  return {
    sampleRate: input.sampleRate,
    frameCount,
    stems: aligned,
    master,
  };
}

/** Rough byte estimate for interleaved PCM before container overhead. */
export function estimatePcmByteSize(
  frameCount: number,
  channels: number,
  bitDepth: 16 | 24 | 32,
): number {
  return frameCount * channels * (bitDepth / 8);
}
