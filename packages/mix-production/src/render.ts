import { dbToLinear } from "./dsp.js";
import type {
  MixAutomationEngine,
  SidechainRouter,
  TrackEffectsRack,
} from "./types.js";

export type MixTrackRenderInput = {
  trackId: string;
  /** Planar left channel (−1…1). */
  left: Float32Array;
  /** Planar right channel (−1…1); may alias left for mono. */
  right: Float32Array;
  gainDb: number;
  /** Constant pan −1…1 when no pan automation. */
  pan: number;
  mute: boolean;
  solo: boolean;
  clipGainDb?: number;
};

export type MixRenderInput = {
  mixId: string;
  sampleRate: number;
  masterGainDb: number;
  peakCeilingDb: number;
  tracks: MixTrackRenderInput[];
  /** When set, volume automation (dB) is added to track gain per sample. */
  automation?: MixAutomationEngine;
  effects?: TrackEffectsRack;
  sidechain?: SidechainRouter;
};

export type MixRenderResult = {
  /** Interleaved stereo float32. */
  pcm: Float32Array;
  /** Planar left after mix (pre-interleave convenience). */
  left: Float32Array;
  /** Planar right after mix. */
  right: Float32Array;
  frameCount: number;
  peakTrimDb: number;
  /**
   * `phase1` = gain/pan/mute/solo/master/ceiling only.
   * `production` = automation / effects / sidechain also applied.
   */
  path: "phase1" | "production";
};

function panGains(pan: number): [number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4);
  return [Math.cos(angle), Math.sin(angle)];
}

function toInterleaved(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.max(left.length, right.length);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = left[i] ?? 0;
    out[i * 2 + 1] = right[i] ?? 0;
  }
  return out;
}

function fromInterleaved(
  pcm: Float32Array,
  frameCount: number,
): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    left[i] = pcm[i * 2] ?? 0;
    right[i] = pcm[i * 2 + 1] ?? 0;
  }
  return { left, right };
}

/**
 * Offline mix renderer shared by Web Audio playback bake and export (§10.5 + §10.3).
 * Same float32 math for both paths — approximate match, not bit-exact with the
 * historical Rust-only exporter or with the live GainNode graph.
 */
export function renderMixOffline(input: MixRenderInput): MixRenderResult {
  const anySolo = input.tracks.some((t) => t.solo);
  let maxLen = 0;
  for (const t of input.tracks) {
    maxLen = Math.max(maxLen, t.left.length, t.right.length);
  }

  const hasAutomation =
    (input.automation?.listLanes(input.mixId).length ?? 0) > 0;
  const hasEffects = input.tracks.some(
    (t) => (input.effects?.list(t.trackId).length ?? 0) > 0,
  );
  const hasSidechain =
    (input.sidechain?.listRoutes(input.mixId).length ?? 0) > 0;
  const path: MixRenderResult["path"] =
    hasAutomation || hasEffects || hasSidechain ? "production" : "phase1";

  // 1) Build per-track interleaved, pad to maxLen, run effects.
  // Reverb (and custom processors) may extend buffers — recompute frame count
  // afterward so the documented wet queue is not truncated.
  const processed = new Map<string, Float32Array>();
  const sr = Math.max(1, input.sampleRate);
  for (const track of input.tracks) {
    const left = new Float32Array(maxLen);
    const right = new Float32Array(maxLen);
    left.set(track.left.subarray(0, Math.min(track.left.length, maxLen)));
    right.set(track.right.subarray(0, Math.min(track.right.length, maxLen)));
    let interleaved = toInterleaved(left, right);
    if (input.effects) {
      interleaved = input.effects.process(track.trackId, interleaved, sr);
    }
    processed.set(track.trackId, interleaved);
  }

  for (const pcm of processed.values()) {
    maxLen = Math.max(maxLen, Math.floor(pcm.length / 2));
  }

  // 2) Sidechain ducking (destination modified from source envelopes).
  // Pad shorter buffers to maxLen so linked ducking stays frame-aligned.
  if (input.sidechain) {
    for (const track of input.tracks) {
      let dest = processed.get(track.trackId);
      if (!dest) continue;
      if (dest.length < maxLen * 2) {
        const padded = new Float32Array(maxLen * 2);
        padded.set(dest);
        dest = padded;
        processed.set(track.trackId, dest);
      }
      processed.set(
        track.trackId,
        input.sidechain.applyDucking(
          input.mixId,
          track.trackId,
          dest,
          processed,
        ),
      );
    }
  }

  // 3) Sum with mute/solo, gain, pan, automation, master.
  const outL = new Float32Array(maxLen);
  const outR = new Float32Array(maxLen);
  const master = dbToLinear(input.masterGainDb);

  for (const track of input.tracks) {
    const silent = track.mute || (anySolo && !track.solo);
    if (silent) continue;
    const pcm = processed.get(track.trackId);
    if (!pcm) continue;
    const clipLin = dbToLinear(track.clipGainDb ?? 0);
    const [basePanL, basePanR] = panGains(track.pan);
    const volLane = input.automation
      ?.listLanes(input.mixId)
      .some((l) => l.trackId === track.trackId && l.target === "volume");
    const panLane = input.automation
      ?.listLanes(input.mixId)
      .some((l) => l.trackId === track.trackId && l.target === "pan");

    for (let i = 0; i < maxLen; i++) {
      const timeMs = (i / sr) * 1000;
      let gainDb = track.gainDb;
      if (volLane && input.automation) {
        // Volume lane replaces the fader (absolute dB), matching the UI sampler.
        gainDb = input.automation.sampleAt(
          input.mixId,
          track.trackId,
          "volume",
          timeMs,
        );
      }
      const gainLin = dbToLinear(gainDb) * clipLin;
      let panL = basePanL;
      let panR = basePanR;
      if (panLane && input.automation) {
        [panL, panR] = panGains(
          input.automation.sampleAt(
            input.mixId,
            track.trackId,
            "pan",
            timeMs,
          ),
        );
      }
      const l = pcm[i * 2] ?? 0;
      const r = pcm[i * 2 + 1] ?? 0;
      outL[i]! += master * gainLin * panL * l;
      outR[i]! += master * gainLin * panR * r;
    }
  }

  // 4) Peak ceiling (§10.5).
  let peak = 0;
  for (let i = 0; i < maxLen; i++) {
    peak = Math.max(peak, Math.abs(outL[i]!), Math.abs(outR[i]!));
  }
  const ceiling = dbToLinear(input.peakCeilingDb);
  let peakTrimDb = 0;
  if (peak > ceiling && peak > 0) {
    const trim = ceiling / peak;
    peakTrimDb = 20 * Math.log10(trim);
    for (let i = 0; i < maxLen; i++) {
      outL[i]! *= trim;
      outR[i]! *= trim;
    }
  }

  return {
    pcm: toInterleaved(outL, outR),
    left: outL,
    right: outR,
    frameCount: maxLen,
    peakTrimDb,
    path,
  };
}

/** Split interleaved stereo into planar channels (for AudioBuffer copy). */
export function interleavedToPlanar(
  pcm: Float32Array,
  frameCount?: number,
): { left: Float32Array; right: Float32Array } {
  const n = frameCount ?? Math.floor(pcm.length / 2);
  return fromInterleaved(pcm, n);
}
