import type { AutomationPoint } from "./types.js";

/** Linear interpolation between sorted automation points. */
export function sampleAutomationPoints(
  points: AutomationPoint[],
  timeMs: number,
): number {
  if (points.length === 0) {
    return 0;
  }
  const sorted = [...points].sort((a, b) => a.timeMs - b.timeMs);
  if (timeMs <= sorted[0]!.timeMs) {
    return sorted[0]!.value;
  }
  const last = sorted[sorted.length - 1]!;
  if (timeMs >= last.timeMs) {
    return last.value;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (timeMs >= a.timeMs && timeMs <= b.timeMs) {
      const span = b.timeMs - a.timeMs;
      if (span <= 0) return b.value;
      const t = (timeMs - a.timeMs) / span;
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 1e-12) return -120;
  return 20 * Math.log10(linear);
}

/**
 * Soft peak limiter: reduces gain when |sample| exceeds ceiling.
 * Ceiling in linear (−1…1), e.g. 10^(-1/20) ≈ 0.891 for −1 dBFS.
 */
export function applyPeakLimiter(
  pcm: Float32Array,
  ceilingLinear: number,
): Float32Array {
  const out = new Float32Array(pcm.length);
  const ceiling = Math.max(1e-6, Math.min(1, ceilingLinear));
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i]!;
    const a = Math.abs(s);
    if (a <= ceiling) {
      out[i] = s;
    } else {
      // Soft knee: compress excess toward ceiling
      const excess = a - ceiling;
      const compressed = ceiling + excess / (1 + excess * 4);
      out[i] = Math.sign(s) * Math.min(compressed, 0.999);
    }
  }
  return out;
}

/**
 * Simple feed-forward compressor on interleaved stereo (linked channels).
 * params: thresholdDb, ratio, makeupDb
 */
export function applyCompressor(
  pcm: Float32Array,
  thresholdDb: number,
  ratio: number,
  makeupDb = 0,
): Float32Array {
  const thr = dbToLinear(thresholdDb);
  const r = Math.max(1, ratio);
  const makeup = dbToLinear(makeupDb);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) {
    const l = pcm[i] ?? 0;
    const ri = pcm[i + 1] ?? l;
    const peak = Math.max(Math.abs(l), Math.abs(ri));
    let gain = 1;
    if (peak > thr && peak > 1e-12) {
      const overDb = linearToDb(peak) - thresholdDb;
      const reducedDb = overDb - overDb / r;
      gain = dbToLinear(-reducedDb);
    }
    out[i] = l * gain * makeup;
    if (i + 1 < pcm.length) {
      out[i + 1] = ri * gain * makeup;
    }
  }
  return out;
}

/** One-pole high-shelf-ish gain (very light EQ stand-in). */
export function applyGainShelf(pcm: Float32Array, gainDb: number): Float32Array {
  const g = dbToLinear(gainDb);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = (pcm[i] ?? 0) * g;
  }
  return out;
}

export type ReverbParams = {
  /** Wet amount 0…1 (dry = 1 − mix). */
  mix: number;
  /** Room size 0…1 — longer comb feedback / longer documented tail. */
  roomSize: number;
  /** High-frequency damping 0…1 inside the comb filters. */
  damping: number;
  /** Stereo width 0…1 (0 = mono wet, 1 = full L/R spread). */
  width: number;
};

/** Comb delay lengths (samples @ 44.1 kHz), Freeverb-inspired. */
const REVERB_COMB_L = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617] as const;
const REVERB_COMB_R = [1116 + 23, 1188 + 23, 1277 + 23, 1356 + 23, 1422 + 23, 1491 + 23, 1557 + 23, 1617 + 23] as const;
const REVERB_ALLPASS_L = [556, 441, 341, 225] as const;
const REVERB_ALLPASS_R = [556 + 23, 441 + 23, 341 + 23, 225 + 23] as const;

/**
 * Approximate reverb tail in frames for a given roomSize.
 * Documented so offline render can pad and avoid truncating the queue.
 * roomSize 0 → ~0.35 s ; roomSize 1 → ~2.8 s.
 */
export function reverbTailFrames(roomSize: number, sampleRate: number): number {
  const rs = Math.max(0, Math.min(1, roomSize));
  const decaySec = 0.35 + rs * 2.45;
  return Math.ceil(decaySec * Math.max(1, sampleRate));
}

function scaleDelay(samplesAt44100: number, sampleRate: number): number {
  return Math.max(1, Math.round((samplesAt44100 * sampleRate) / 44100));
}

/**
 * Stereo algorithmic reverb (Schroeder / Freeverb-style comb + allpass).
 * Extends the buffer by {@link reverbTailFrames} so the wet queue is not clipped.
 * Interleaved stereo float32 (−1…1).
 */
export function applyReverb(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<ReverbParams> = {},
): Float32Array {
  const mix = Math.max(0, Math.min(1, params.mix ?? 0.35));
  const roomSize = Math.max(0, Math.min(1, params.roomSize ?? 0.55));
  const damping = Math.max(0, Math.min(1, params.damping ?? 0.45));
  const width = Math.max(0, Math.min(1, params.width ?? 1));
  const sr = Math.max(1, sampleRate);
  const dryFrames = Math.floor(pcm.length / 2);
  const tail = reverbTailFrames(roomSize, sr);
  const frames = dryFrames + tail;
  const out = new Float32Array(frames * 2);
  if (dryFrames === 0 || mix <= 1e-6) {
    out.set(pcm.subarray(0, Math.min(pcm.length, out.length)));
    return out;
  }

  const feedback = 0.28 + roomSize * 0.7;
  const damp = damping;

  type Comb = { buf: Float32Array; idx: number; filter: number };
  type Allpass = { buf: Float32Array; idx: number };

  const makeComb = (len441: number): Comb => ({
    buf: new Float32Array(scaleDelay(len441, sr)),
    idx: 0,
    filter: 0,
  });
  const makeAllpass = (len441: number): Allpass => ({
    buf: new Float32Array(scaleDelay(len441, sr)),
    idx: 0,
  });

  const combsL = REVERB_COMB_L.map(makeComb);
  const combsR = REVERB_COMB_R.map(makeComb);
  const allpassL = REVERB_ALLPASS_L.map(makeAllpass);
  const allpassR = REVERB_ALLPASS_R.map(makeAllpass);

  const processComb = (c: Comb, input: number): number => {
    const y = c.buf[c.idx]!;
    c.filter = y * (1 - damp) + c.filter * damp;
    c.buf[c.idx] = input + c.filter * feedback;
    c.idx = (c.idx + 1) % c.buf.length;
    return y;
  };

  const processAllpass = (a: Allpass, input: number): number => {
    const bufOut = a.buf[a.idx]!;
    const y = -input + bufOut;
    a.buf[a.idx] = input + bufOut * 0.5;
    a.idx = (a.idx + 1) % a.buf.length;
    return y;
  };

  const dryGain = 1 - mix;
  const wetGain = mix * 0.35; // comb sum scale

  for (let i = 0; i < frames; i++) {
    const dryL = i < dryFrames ? (pcm[i * 2] ?? 0) : 0;
    const dryR = i < dryFrames ? (pcm[i * 2 + 1] ?? dryL) : 0;
    const input = (dryL + dryR) * 0.5;

    let wetL = 0;
    let wetR = 0;
    for (const c of combsL) wetL += processComb(c, input);
    for (const c of combsR) wetR += processComb(c, input);
    for (const a of allpassL) wetL = processAllpass(a, wetL);
    for (const a of allpassR) wetR = processAllpass(a, wetR);

    const mid = (wetL + wetR) * 0.5;
    const sideL = wetL - mid;
    const sideR = wetR - mid;
    wetL = mid + sideL * width;
    wetR = mid + sideR * width;

    out[i * 2] = dryL * dryGain + wetL * wetGain;
    out[i * 2 + 1] = dryR * dryGain + wetR * wetGain;
  }
  return out;
}

/**
 * Duck destination from source envelope (interleaved stereo, same length preferred).
 */
export function applySidechainDuck(
  destination: Float32Array,
  source: Float32Array,
  thresholdDb: number,
  ratio: number,
): Float32Array {
  const thr = dbToLinear(thresholdDb);
  const r = Math.max(1, ratio);
  const len = destination.length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 2) {
    const sL = source[i] ?? 0;
    const sR = source[i + 1] ?? sL;
    const srcPeak = Math.max(Math.abs(sL), Math.abs(sR));
    let gain = 1;
    if (srcPeak > thr && srcPeak > 1e-12) {
      const overDb = linearToDb(srcPeak) - thresholdDb;
      const reducedDb = overDb - overDb / r;
      gain = dbToLinear(-reducedDb);
    }
    out[i] = (destination[i] ?? 0) * gain;
    if (i + 1 < len) {
      out[i + 1] = (destination[i + 1] ?? 0) * gain;
    }
  }
  return out;
}

/**
 * Lightweight loudness estimate on interleaved stereo float32.
 * True peak = max |sample|. Integrated ≈ mean-square → LUFS-ish (not a full BS.1770 K-filter).
 */
export function measureLoudnessFromPcm(
  pcm: Float32Array,
  _sampleRate: number,
): { integratedLufs: number; truePeakDbfs: number } {
  let peak = 0;
  let sumSq = 0;
  const n = pcm.length;
  if (n === 0) {
    return { integratedLufs: -120, truePeakDbfs: -120 };
  }
  for (let i = 0; i < n; i++) {
    const a = Math.abs(pcm[i] ?? 0);
    if (a > peak) peak = a;
    sumSq += (pcm[i] ?? 0) ** 2;
  }
  const meanSq = sumSq / n;
  const integratedLufs = meanSq <= 1e-20 ? -120 : linearToDb(Math.sqrt(meanSq)) - 0.691;
  const truePeakDbfs = peak <= 1e-12 ? -120 : linearToDb(peak);
  return { integratedLufs, truePeakDbfs };
}
