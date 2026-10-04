/**
 * Post-process HTDemucs 6-stem piano bleed (#344).
 *
 * Uses the estimated piano stem as an interferer to mask other stems.
 * Does **not** retrain HTDemucs and does **not** clean the piano stem itself.
 */

const FFT = 512;
const HOP = 256;

function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
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

function toMono(pcm: Float32Array): Float32Array {
  if (pcm.length % 2 !== 0) return pcm;
  const frames = pcm.length / 2;
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    mono[i] = 0.5 * ((pcm[i * 2] ?? 0) + (pcm[i * 2 + 1] ?? 0));
  }
  return mono;
}

function fromMono(mono: Float32Array, stereoLen: number): Float32Array {
  const out = new Float32Array(stereoLen);
  const frames = Math.floor(stereoLen / 2);
  for (let i = 0; i < frames; i++) {
    const s = mono[i] ?? 0;
    out[i * 2] = s;
    out[i * 2 + 1] = s;
  }
  return out;
}

/** Tone energy around `hz` (Goertzel-ish) on interleaved stereo. */
export function bandEnergy(pcm: Float32Array, sampleRate: number, hz: number): number {
  const mono = toMono(pcm);
  let re = 0;
  let im = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = (2 * Math.PI * hz * i) / sampleRate;
    const s = mono[i] ?? 0;
    re += s * Math.cos(a);
    im += s * Math.sin(a);
  }
  return Math.hypot(re, im) / Math.max(1, mono.length);
}

function suppressMono(other: Float32Array, piano: Float32Array, strength: number): Float32Array {
  const n = Math.min(other.length, piano.length);
  const out = new Float32Array(other.length);
  const reO = new Float64Array(FFT);
  const imO = new Float64Array(FFT);
  const reP = new Float64Array(FFT);
  const imP = new Float64Array(FFT);
  const acc = new Float64Array(n);
  const wsum = new Float64Array(n);
  const win = new Float64Array(FFT);
  for (let i = 0; i < FFT; i++) win[i] = hann(i, FFT);
  const bins = FFT / 2;
  for (let start = 0; start + FFT <= n; start += HOP) {
    for (let i = 0; i < FFT; i++) {
      const w = win[i] ?? 0;
      reO[i] = (other[start + i] ?? 0) * w;
      imO[i] = 0;
      reP[i] = (piano[start + i] ?? 0) * w;
      imP[i] = 0;
    }
    fftRadix2(reO, imO, false);
    fftRadix2(reP, imP, false);
    for (let b = 1; b < bins; b++) {
      const o2 = (reO[b] ?? 0) ** 2 + (imO[b] ?? 0) ** 2;
      const p2 = (reP[b] ?? 0) ** 2 + (imP[b] ?? 0) ** 2;
      const mask = o2 / (o2 + strength * p2 + 1e-12);
      reO[b]! *= mask;
      imO[b]! *= mask;
      const m = FFT - b;
      reO[m]! *= mask;
      imO[m]! *= mask;
    }
    fftRadix2(reO, imO, true);
    for (let i = 0; i < FFT; i++) {
      const idx = start + i;
      if (idx >= n) break;
      const w = win[i] ?? 0;
      acc[idx] = (acc[idx] ?? 0) + (reO[i] ?? 0) * w;
      wsum[idx] = (wsum[idx] ?? 0) + w * w;
    }
  }
  for (let i = 0; i < n; i++) {
    const den = wsum[i] ?? 0;
    out[i] = den > 1e-8 ? (acc[i] ?? 0) / den : (other[i] ?? 0);
  }
  for (let i = n; i < other.length; i++) out[i] = other[i] ?? 0;
  return out;
}

/**
 * Reduce piano-correlated energy in a non-piano stem.
 * `strength` 0 = dry, 1 = aggressive Wiener against the piano stem.
 */
export function suppressPianoBleed(
  otherStereo: Float32Array,
  pianoStereo: Float32Array,
  strength = 0.85,
): Float32Array {
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 1e-6 || otherStereo.length === 0) {
    return new Float32Array(otherStereo);
  }
  const other = toMono(otherStereo);
  const piano = toMono(pianoStereo);
  const wet = suppressMono(other, piano, s);
  return fromMono(wet, otherStereo.length);
}

export const HTDEMUCS_6S_PIANO_WARNING_FR =
  "Déconseillé pour un mix piano-heavy : le piano fuit dans les autres stems. HTDemucs 4 stems reste le choix recommandé. Un masque spectral post-séparation réduit la corrélation piano dans voix/batterie/basse/other/guitare ; le stem piano lui-même n’est pas nettoyé. Mesure : test synthétique 440 Hz (voir packages/stem-providers).";
