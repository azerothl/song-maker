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
