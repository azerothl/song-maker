/**
 * Classical voice cleanup / denoise for mic recordings (issue #164).
 *
 * Spectral soft-mask on short frames (no ML). Strength subtracts toward a
 * noise-floor estimate; preserveAttack blends dry on fast onsets so consonants
 * survive over-cleaning. Apache-2.0 in-repo — no GPL RubberBand / third-party
 * voice models.
 */

import { dbToLinear, linearToDb } from "./dsp.js";

export type VoiceCleanupParams = {
  /** 0 = dry, 1 = aggressive noise reduction. */
  strength: number;
  /** Assumed stationary noise floor (dBFS). */
  noiseFloorDb: number;
  /** 0 = process everything, 1 = fully protect detected attacks/consonants. */
  preserveAttack: number;
};

const FFT_SIZE = 512;
const HOP = 128;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** In-place radix-2 Cooley–Tukey (real interleaved as re/im pairs). */
function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error("FFT size must be a power of two");
  }
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + half]! * wRe - im[i + k + half]! * wIm;
        const vIm = re[i + k + half]! * wIm + im[i + k + half]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i]! *= inv;
      im[i]! *= inv;
    }
  }
}

function hann(i: number, n: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
}

function processMono(
  mono: Float32Array,
  sampleRate: number,
  params: VoiceCleanupParams,
): Float32Array {
  const strength = clamp01(params.strength);
  const preserve = clamp01(params.preserveAttack);
  const noiseFloorDb = clamp(
    Number.isFinite(params.noiseFloorDb) ? params.noiseFloorDb : -48,
    -90,
    -6,
  );
  if (strength <= 1e-6 || mono.length === 0) {
    return new Float32Array(mono);
  }

  const sr = Math.max(1, sampleRate);
  const noiseLin = dbToLinear(noiseFloorDb);
  const hpFc = 60;
  const hpA = Math.exp((-2 * Math.PI * hpFc) / sr);
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  const pre = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i] ?? 0;
    const y = hpA * (hpPrevOut + x - hpPrevIn);
    hpPrevIn = x;
    hpPrevOut = y;
    pre[i] = y;
  }

  const out = new Float32Array(mono.length);
  const norm = new Float32Array(mono.length);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const win = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) win[i] = hann(i, FFT_SIZE);

  let prevEnergy = 0;
  const frames = Math.max(0, Math.ceil((pre.length - FFT_SIZE) / HOP) + 1);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    re.fill(0);
    im.fill(0);
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = pre[start + i] ?? 0;
      const w = win[i]!;
      re[i] = s * w;
      energy += s * s;
    }
    energy = Math.sqrt(energy / FFT_SIZE);
    const onset =
      prevEnergy > 1e-8 ? Math.max(0, (energy - prevEnergy) / (prevEnergy + 1e-8)) : 0;
    prevEnergy = energy;
    const attackBlend = clamp01(onset * 2) * preserve;

    fftRadix2(re, im, false);

    for (let k = 0; k < FFT_SIZE; k++) {
      const mag = Math.hypot(re[k]!, im[k]!);
      if (mag < 1e-12) {
        re[k] = 0;
        im[k] = 0;
        continue;
      }
      const noiseMag = noiseLin * Math.sqrt(FFT_SIZE) * 0.5;
      const cleaned = Math.max(0, mag - strength * noiseMag);
      const mask = cleaned / mag;
      const soft = mask * (1 - 0.15 * strength) + 0.15 * strength * mask * mask;
      const g = soft * (1 - attackBlend) + attackBlend;
      re[k]! *= g;
      im[k]! *= g;
    }

    fftRadix2(re, im, true);

    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      if (idx >= out.length) break;
      const w = win[i]!;
      const wet = re[i]!;
      const dry = mono[idx] ?? 0;
      const sample = wet * (1 - attackBlend * 0.35) + dry * attackBlend * 0.35;
      out[idx]! += sample * w;
      norm[idx]! += w * w;
    }
  }

  for (let i = 0; i < out.length; i++) {
    const n = norm[i]!;
    if (n > 1e-8) out[i]! /= n;
    else out[i] = mono[i] ?? 0;
  }

  const wetAmt = 0.35 + 0.65 * strength;
  for (let i = 0; i < out.length; i++) {
    const dry = mono[i] ?? 0;
    out[i] = dry * (1 - wetAmt) + out[i]! * wetAmt;
  }

  return out;
}

/**
 * Apply classical voice cleanup on interleaved stereo PCM (−1…1).
 * Linked mid processing with side lightly attenuated by strength.
 */
export function applyVoiceCleanup(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<VoiceCleanupParams> = {},
): Float32Array {
  const strength = clamp01(
    typeof params.strength === "number" ? params.strength : 0.55,
  );
  const noiseFloorDb =
    typeof params.noiseFloorDb === "number" && Number.isFinite(params.noiseFloorDb)
      ? params.noiseFloorDb
      : -48;
  const preserveAttack = clamp01(
    typeof params.preserveAttack === "number" ? params.preserveAttack : 0.65,
  );

  if (pcm.length === 0 || strength <= 1e-6) {
    return new Float32Array(pcm);
  }

  const frames = Math.floor(pcm.length / 2);
  const mid = new Float32Array(frames);
  const side = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = pcm[i * 2] ?? 0;
    const r = pcm[i * 2 + 1] ?? l;
    mid[i] = 0.5 * (l + r);
    side[i] = 0.5 * (l - r);
  }

  const cleanedMid = processMono(mid, sampleRate, {
    strength,
    noiseFloorDb,
    preserveAttack,
  });

  const sideGain = 1 - 0.35 * strength;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < frames; i++) {
    const m = cleanedMid[i] ?? 0;
    const s = (side[i] ?? 0) * sideGain;
    out[i * 2] = m + s;
    out[i * 2 + 1] = m - s;
  }
  if (pcm.length % 2 === 1) {
    out[pcm.length - 1] = pcm[pcm.length - 1] ?? 0;
  }
  return out;
}

/** Peak level helper used by tests. */
export function peakDb(pcm: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i] ?? 0);
    if (a > peak) peak = a;
  }
  return peak <= 1e-12 ? -120 : linearToDb(peak);
}
