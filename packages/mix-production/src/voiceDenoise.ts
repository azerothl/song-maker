/**
 * Statistical MMSE-style voice denoise (#337), distinct from `voice_cleanup`.
 *
 * Not a neural net (no RNNoise / DeepFilterNet weights). Noise PSD is
 * estimated from quiet frames; Wiener-like gains are applied in STFT.
 */

const FFT_SIZE = 512;
const HOP = 128;

export type VoiceDenoiseParams = {
  /** 0 = dry, 1 = full statistical suppression. */
  strength: number;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

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

function processMono(mono: Float32Array, strength: number): Float32Array {
  const bins = FFT_SIZE / 2;
  const energies: number[] = [];
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    let e = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = (mono[start + i] ?? 0) * hann(i, FFT_SIZE);
      e += x * x;
    }
    energies.push(e);
  }
  if (energies.length === 0) return new Float32Array(mono);
  const sorted = [...energies].sort((a, b) => a - b);
  const quietThresh = sorted[Math.max(0, Math.floor(sorted.length * 0.2))] ?? 0;

  const noise = new Float64Array(bins);
  let noiseFrames = 0;
  let idx = 0;
  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    if ((energies[idx] ?? 0) <= quietThresh * 1.05) {
      for (let i = 0; i < FFT_SIZE; i++) {
        re[i] = (mono[start + i] ?? 0) * hann(i, FFT_SIZE);
        im[i] = 0;
      }
      fftRadix2(re, im, false);
      for (let b = 0; b < bins; b++) {
        const mag2 = (re[b] ?? 0) ** 2 + (im[b] ?? 0) ** 2;
        noise[b] = (noise[b] ?? 0) + mag2;
      }
      noiseFrames += 1;
    }
    idx += 1;
  }
  const nFrames = Math.max(1, noiseFrames);
  for (let b = 0; b < bins; b++) {
    noise[b] = Math.max(1e-12, (noise[b] ?? 0) / nFrames);
  }

  const out = new Float32Array(mono.length);
  const acc = new Float64Array(mono.length);
  const wsum = new Float64Array(mono.length);
  const window = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) window[i] = hann(i, FFT_SIZE);

  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[start + i] ?? 0) * (window[i] ?? 0);
      im[i] = 0;
    }
    fftRadix2(re, im, false);
    for (let b = 1; b < bins; b++) {
      const mag2 = (re[b] ?? 0) ** 2 + (im[b] ?? 0) ** 2;
      const lambda = noise[b] ?? 1e-12;
      const xi = Math.max(0, mag2 / lambda - 1);
      const gain = xi / (1 + xi);
      const g = 1 - strength * (1 - gain);
      re[b]! *= g;
      im[b]! *= g;
      const mirror = FFT_SIZE - b;
      re[mirror]! *= g;
      im[mirror]! *= g;
    }
    fftRadix2(re, im, true);
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      if (idx >= out.length) break;
      const w = window[i] ?? 0;
      acc[idx] = (acc[idx] ?? 0) + (re[i] ?? 0) * w;
      wsum[idx] = (wsum[idx] ?? 0) + w * w;
    }
  }
  const wetAmt = 0.35 + 0.65 * strength;
  for (let i = 0; i < mono.length; i++) {
    const den = wsum[i] ?? 0;
    const wet = den > 1e-8 ? (acc[i] ?? 0) / den : (mono[i] ?? 0);
    const dry = mono[i] ?? 0;
    out[i] = dry * (1 - wetAmt) + wet * wetAmt;
  }
  return out;
}

export function applyVoiceDenoise(
  pcm: Float32Array,
  _sampleRate: number,
  params: Partial<VoiceDenoiseParams> = {},
): Float32Array {
  const strength = clamp01(
    typeof params.strength === "number" ? params.strength : 0.55,
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
  const wet = processMono(mid, strength);
  let dryPeak = 0;
  let wetPeak = 0;
  for (let i = 0; i < frames; i++) {
    dryPeak = Math.max(dryPeak, Math.abs(mid[i] ?? 0));
    wetPeak = Math.max(wetPeak, Math.abs(wet[i] ?? 0));
  }
  const peakMatch = wetPeak > 1e-8 ? Math.min(1, dryPeak / wetPeak) : 1;
  const out = new Float32Array(pcm.length);
  const sideGain = 1 - 0.25 * strength;
  for (let i = 0; i < frames; i++) {
    const m = (wet[i] ?? 0) * peakMatch;
    const s = (side[i] ?? 0) * sideGain;
    out[i * 2] = m + s;
    out[i * 2 + 1] = m - s;
  }
  if (pcm.length % 2 === 1) {
    out[pcm.length - 1] = pcm[pcm.length - 1] ?? 0;
  }
  return out;
}
