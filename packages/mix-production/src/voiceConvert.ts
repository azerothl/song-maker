/**
 * Own-voice conversion via spectral-envelope transfer (#337).
 *
 * Not a neural RVC/So-VITS model. Requires the user's own reference recording
 * (consent already gated in UI). Third-party / artist voices stay out of scope.
 */

const FFT_SIZE = 512;
const HOP = 128;
const BANDS = 24;

export type VoiceConvertParams = {
  consentOwnVoice: boolean;
  /** Serialized envelope from `serializeEnvelope`. */
  targetEnvelope?: string;
  /** 0 = dry, 1 = full envelope match. */
  mix: number;
};

export const VOICE_CONVERT_NO_REFERENCE = "VOICE_CONVERT_NO_REFERENCE";

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

function bandIndex(bin: number, nyquistBins: number): number {
  const t = Math.max(0, Math.min(1, bin / Math.max(1, nyquistBins - 1)));
  const mel = Math.log(1 + 700 * t) / Math.log(1 + 700);
  return Math.min(BANDS - 1, Math.floor(mel * BANDS));
}

function envelopeFromMono(mono: Float32Array): number[] {
  const bands = new Float64Array(BANDS);
  const counts = new Float64Array(BANDS);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const nyquist = FFT_SIZE / 2;
  let frames = 0;
  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[start + i] ?? 0) * hann(i, FFT_SIZE);
      im[i] = 0;
    }
    fftRadix2(re, im, false);
    for (let bin = 1; bin < nyquist; bin++) {
      const mag = Math.hypot(re[bin] ?? 0, im[bin] ?? 0);
      const b = bandIndex(bin, nyquist);
      bands[b] = (bands[b] ?? 0) + mag;
      counts[b] = (counts[b] ?? 0) + 1;
    }
    frames += 1;
  }
  if (frames === 0) {
    return Array.from({ length: BANDS }, () => 1);
  }
  const out: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    const n = counts[b] || 1;
    out.push(Math.max(1e-6, (bands[b] ?? 0) / n));
  }
  return out;
}

export function serializeEnvelope(bands: number[]): string {
  return bands
    .slice(0, BANDS)
    .map((v) => (Number.isFinite(v) ? Math.max(1e-6, v).toFixed(5) : "0.00001"))
    .join(",");
}

export function parseEnvelope(raw: unknown): number[] | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length < 8 || parts.length > BANDS) return null;
  if (parts.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const normalized = parts.map((v) => Math.max(1e-6, v));
  while (normalized.length < BANDS) {
    normalized.push(normalized[normalized.length - 1] ?? 1e-6);
  }
  return normalized.slice(0, BANDS);
}

export function extractSpectralEnvelope(
  pcm: Float32Array,
  _sampleRate: number,
): number[] {
  if (pcm.length === 0) {
    return Array.from({ length: BANDS }, () => 1);
  }
  const stereo = pcm.length >= 2 && pcm.length % 2 === 0;
  if (stereo) {
    const frames = pcm.length / 2;
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      mono[i] = 0.5 * ((pcm[i * 2] ?? 0) + (pcm[i * 2 + 1] ?? 0));
    }
    return envelopeFromMono(mono);
  }
  return envelopeFromMono(pcm);
}

function applyEnvelopeMono(
  mono: Float32Array,
  target: number[],
  mix: number,
): Float32Array {
  if (mix <= 1e-6) return new Float32Array(mono);
  const out = new Float32Array(mono.length);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const window = new Float64Array(FFT_SIZE);
  const acc = new Float64Array(mono.length);
  const wsum = new Float64Array(mono.length);
  const nyquist = FFT_SIZE / 2;
  for (let i = 0; i < FFT_SIZE; i++) window[i] = hann(i, FFT_SIZE);

  for (let start = 0; start + FFT_SIZE <= mono.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[start + i] ?? 0) * (window[i] ?? 0);
      im[i] = 0;
    }
    fftRadix2(re, im, false);
    const current = new Float64Array(BANDS);
    const counts = new Float64Array(BANDS);
    for (let bin = 1; bin < nyquist; bin++) {
      const mag = Math.hypot(re[bin] ?? 0, im[bin] ?? 0);
      const b = bandIndex(bin, nyquist);
      current[b] = (current[b] ?? 0) + mag;
      counts[b] = (counts[b] ?? 0) + 1;
    }
    const gain = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      const src = Math.max(1e-6, (current[b] ?? 0) / (counts[b] || 1));
      const tgt = target[b] ?? src;
      const ratio = tgt / src;
      const limited = Math.max(0.25, Math.min(4, ratio));
      gain[b] = 1 + mix * (limited - 1);
    }
    for (let bin = 1; bin < nyquist; bin++) {
      const g = gain[bandIndex(bin, nyquist)] ?? 1;
      re[bin]! *= g;
      im[bin]! *= g;
      const mirror = FFT_SIZE - bin;
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
  for (let i = 0; i < mono.length; i++) {
    const den = wsum[i] ?? 0;
    const wet = den > 1e-8 ? (acc[i] ?? 0) / den : (mono[i] ?? 0);
    const dry = mono[i] ?? 0;
    out[i] = dry * (1 - mix) + wet * mix;
  }
  return out;
}

/**
 * Interleaved stereo PCM. Without consent: dry copy.
 * With consent and no envelope: throws `VOICE_CONVERT_NO_REFERENCE`.
 */
export function applyVoiceConvert(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<VoiceConvertParams> = {},
): Float32Array {
  void sampleRate;
  const consent = params.consentOwnVoice === true;
  const mix = clamp01(typeof params.mix === "number" ? params.mix : 0.65);
  if (!consent) {
    return new Float32Array(pcm);
  }
  const envelope = parseEnvelope(params.targetEnvelope);
  if (!envelope) {
    throw new Error(VOICE_CONVERT_NO_REFERENCE);
  }
  if (pcm.length === 0 || mix <= 1e-6) {
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
  const wet = applyEnvelopeMono(mid, envelope, mix);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < frames; i++) {
    const m = wet[i] ?? 0;
    const s = side[i] ?? 0;
    out[i * 2] = m + s;
    out[i * 2 + 1] = m - s;
  }
  if (pcm.length % 2 === 1) {
    out[pcm.length - 1] = pcm[pcm.length - 1] ?? 0;
  }
  return out;
}

export function voiceConvertHasReference(params: Record<string, number | string | boolean>): boolean {
  return parseEnvelope(params.targetEnvelope) != null;
}
