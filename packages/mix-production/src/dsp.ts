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

export type CompressorOptions = {
  /** Attack time in ms (gain reduction engage). Default 10. */
  attackMs?: number;
  /** Release time in ms. Default 100. */
  releaseMs?: number;
  /** Soft-knee width in dB. Default 0 (hard knee). */
  kneeDb?: number;
  sampleRate?: number;
  /** Filled with peak gain reduction in dB (positive = quieter). */
  meter?: { peakReductionDb: number };
};

/**
 * Stereo-linked compressor with optional attack / release / soft knee.
 * Legacy call sites may omit `options` (instantaneous hard-knee behaviour
 * when attack/release are both ~0).
 */
export function applyCompressor(
  pcm: Float32Array,
  thresholdDb: number,
  ratio: number,
  makeupDb = 0,
  options: CompressorOptions = {},
): Float32Array {
  const thrDb = Number.isFinite(thresholdDb) ? thresholdDb : -18;
  const r = Math.max(1, Math.min(20, Number.isFinite(ratio) ? ratio : 4));
  const makeup = dbToLinear(
    Math.max(-24, Math.min(24, Number.isFinite(makeupDb) ? makeupDb : 0)),
  );
  const sr = Math.max(1, options.sampleRate ?? 48000);
  const attackMs = Math.max(0, Math.min(500, options.attackMs ?? 10));
  const releaseMs = Math.max(1, Math.min(2000, options.releaseMs ?? 100));
  const kneeDb = Math.max(0, Math.min(24, options.kneeDb ?? 0));
  const atkCoeff =
    attackMs <= 0 ? 1 : 1 - Math.exp(-1 / ((attackMs / 1000) * sr));
  const relCoeff =
    releaseMs <= 0 ? 1 : 1 - Math.exp(-1 / ((releaseMs / 1000) * sr));

  const out = new Float32Array(pcm.length);
  let envDb = 0;
  let peakReductionDb = 0;

  for (let i = 0; i < pcm.length; i += 2) {
    const l = pcm[i] ?? 0;
    const ri = pcm[i + 1] ?? l;
    const peak = Math.max(Math.abs(l), Math.abs(ri));
    const levelDb = peak <= 1e-12 ? -120 : linearToDb(peak);

    let overDb = 0;
    if (kneeDb <= 1e-9) {
      if (levelDb > thrDb) overDb = levelDb - thrDb;
    } else {
      const half = kneeDb * 0.5;
      const delta = levelDb - thrDb;
      if (delta > half) {
        overDb = delta;
      } else if (delta > -half) {
        const x = delta + half;
        overDb = (x * x) / (2 * kneeDb);
      }
    }
    const reductionDb = overDb * (1 - 1 / r);

    const coeff = reductionDb > envDb ? atkCoeff : relCoeff;
    envDb += (reductionDb - envDb) * coeff;
    if (envDb > peakReductionDb) peakReductionDb = envDb;

    const gain = dbToLinear(-envDb) * makeup;
    out[i] = l * gain;
    if (i + 1 < pcm.length) {
      out[i + 1] = ri * gain;
    }
  }

  if (options.meter) {
    options.meter.peakReductionDb = peakReductionDb;
  }
  return out;
}

export type GateParams = {
  /** Below this level the gate/expander engages (dBFS). */
  thresholdDb: number;
  /** Expansion ratio (≥ 1). High values ≈ hard gate. */
  ratio: number;
  /** Attack ms when opening (signal rises). */
  attackMs: number;
  /** Release ms when closing. */
  releaseMs: number;
  /** Maximum attenuation in dB (floor). */
  rangeDb: number;
};

/**
 * Downward expander / noise gate on interleaved stereo (linked).
 * Smooth envelope avoids clicks on silence and transients.
 */
export function applyGate(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<GateParams> = {},
): Float32Array {
  const thrDb = Math.max(
    -80,
    Math.min(0, Number.isFinite(params.thresholdDb) ? params.thresholdDb! : -40),
  );
  const r = Math.max(
    1,
    Math.min(100, Number.isFinite(params.ratio) ? params.ratio! : 10),
  );
  const attackMs = Math.max(
    0.1,
    Math.min(200, Number.isFinite(params.attackMs) ? params.attackMs! : 5),
  );
  const releaseMs = Math.max(
    1,
    Math.min(2000, Number.isFinite(params.releaseMs) ? params.releaseMs! : 80),
  );
  const rangeDb = Math.max(
    0,
    Math.min(90, Number.isFinite(params.rangeDb) ? params.rangeDb! : 60),
  );
  const sr = Math.max(1, sampleRate);
  const atkCoeff = 1 - Math.exp(-1 / ((attackMs / 1000) * sr));
  const relCoeff = 1 - Math.exp(-1 / ((releaseMs / 1000) * sr));

  const out = new Float32Array(pcm.length);
  let envGain = 1;

  for (let i = 0; i < pcm.length; i += 2) {
    const l = pcm[i] ?? 0;
    const ri = pcm[i + 1] ?? l;
    const peak = Math.max(Math.abs(l), Math.abs(ri));
    const levelDb = peak <= 1e-12 ? -120 : linearToDb(peak);

    let targetGain = 1;
    if (levelDb < thrDb) {
      const under = thrDb - levelDb;
      const expanded = under * (r - 1);
      const atten = Math.min(rangeDb, expanded);
      targetGain = dbToLinear(-atten);
    }

    const coeff = targetGain > envGain ? atkCoeff : relCoeff;
    envGain += (targetGain - envGain) * coeff;

    out[i] = l * envGain;
    if (i + 1 < pcm.length) {
      out[i + 1] = ri * envGain;
    }
  }
  return out;
}

/** One-pole high-shelf-ish gain (very light EQ stand-in). */
export function applyGainShelf(pcm: Float32Array, gainDb: number): Float32Array {
  const g = dbToLinear(Math.max(-24, Math.min(24, gainDb)));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = (pcm[i] ?? 0) * g;
  }
  return out;
}

export type BiquadType =
  | "lowpass"
  | "highpass"
  | "peak"
  | "lowshelf"
  | "highshelf"
  | "notch";

export type BiquadCoeffs = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/** RBJ Audio EQ Cookbook biquad coefficients. */
export function designBiquad(
  type: BiquadType,
  freqHz: number,
  q: number,
  gainDb: number,
  sampleRate: number,
): BiquadCoeffs {
  const sr = Math.max(1, sampleRate);
  const nyquist = sr * 0.5;
  const f = Math.max(20, Math.min(nyquist * 0.99, freqHz));
  const Q = Math.max(0.1, Math.min(18, q));
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Q);

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  switch (type) {
    case "lowpass": {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "highpass": {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "peak": {
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    case "lowshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + twoSqrtAAlpha);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - twoSqrtAAlpha);
      a0 = A + 1 + (A - 1) * cos + twoSqrtAAlpha;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - twoSqrtAAlpha;
      break;
    }
    case "highshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + twoSqrtAAlpha);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - twoSqrtAAlpha);
      a0 = A + 1 - (A - 1) * cos + twoSqrtAAlpha;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - twoSqrtAAlpha;
      break;
    }
    case "notch": {
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      break;
    }
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

type BiquadState = { z1: number; z2: number };

function processBiquadSample(
  c: BiquadCoeffs,
  s: BiquadState,
  x: number,
): number {
  const y = c.b0 * x + s.z1;
  s.z1 = c.b1 * x - c.a1 * y + s.z2;
  s.z2 = c.b2 * x - c.a2 * y;
  return y;
}

function processBiquadStereo(
  pcm: Float32Array,
  coeffs: BiquadCoeffs[],
): Float32Array {
  const out = new Float32Array(pcm.length);
  const statesL = coeffs.map(() => ({ z1: 0, z2: 0 }));
  const statesR = coeffs.map(() => ({ z1: 0, z2: 0 }));
  for (let i = 0; i < pcm.length; i += 2) {
    let l = pcm[i] ?? 0;
    let r = pcm[i + 1] ?? l;
    for (let k = 0; k < coeffs.length; k++) {
      l = processBiquadSample(coeffs[k]!, statesL[k]!, l);
      r = processBiquadSample(coeffs[k]!, statesR[k]!, r);
    }
    out[i] = l;
    if (i + 1 < pcm.length) out[i + 1] = r;
  }
  return out;
}

export type FilterParams = {
  /** `highpass` or `lowpass`. */
  mode: "highpass" | "lowpass";
  frequencyHz: number;
  /** Slope in dB/octave: 12 or 24. */
  slopeDbPerOct: number;
};

/**
 * High-pass / low-pass filter with 12 or 24 dB/oct slope (cascaded biquads).
 */
export function applyFilter(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<FilterParams> = {},
): Float32Array {
  const mode =
    params.mode === "lowpass" || params.mode === "highpass"
      ? params.mode
      : "highpass";
  const freq = Math.max(
    20,
    Math.min(
      (sampleRate * 0.5) * 0.99,
      Number.isFinite(params.frequencyHz) ? params.frequencyHz! : 120,
    ),
  );
  const slope =
    params.slopeDbPerOct != null && params.slopeDbPerOct >= 18 ? 24 : 12;
  const stages = slope === 24 ? 2 : 1;
  const coeffs: BiquadCoeffs[] = [];
  for (let i = 0; i < stages; i++) {
    coeffs.push(designBiquad(mode, freq, Math.SQRT1_2, 0, sampleRate));
  }
  return processBiquadStereo(pcm, coeffs);
}

export type ParametricBand = {
  type: BiquadType;
  frequencyHz: number;
  gainDb: number;
  q: number;
  enabled?: boolean;
};

export const PARAMETRIC_EQ_BAND_TYPES: readonly BiquadType[] = [
  "peak",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
  "notch",
] as const;

/**
 * Multi-band parametric EQ — cascade of documented biquad curve types.
 * Invalid / extreme values are clamped; disabled bands are skipped.
 */
export function applyParametricEq(
  pcm: Float32Array,
  sampleRate: number,
  bands: readonly ParametricBand[],
): Float32Array {
  const coeffs: BiquadCoeffs[] = [];
  for (const band of bands) {
    if (band.enabled === false) continue;
    const type = PARAMETRIC_EQ_BAND_TYPES.includes(band.type)
      ? band.type
      : "peak";
    const freq = Math.max(
      20,
      Math.min(
        (sampleRate * 0.5) * 0.99,
        Number.isFinite(band.frequencyHz) ? band.frequencyHz : 1000,
      ),
    );
    const gainDb = Math.max(
      -24,
      Math.min(24, Number.isFinite(band.gainDb) ? band.gainDb : 0),
    );
    const q = Math.max(
      0.1,
      Math.min(18, Number.isFinite(band.q) ? band.q : 0.7),
    );
    coeffs.push(designBiquad(type, freq, q, gainDb, sampleRate));
  }
  if (coeffs.length === 0) return new Float32Array(pcm);
  return processBiquadStereo(pcm, coeffs);
}

/** Parse flat effect params `band{N}Type|Freq|Gain|Q|Enabled` into bands. */
export function parametricBandsFromParams(
  params: Record<string, number | string | boolean>,
): ParametricBand[] {
  const countRaw =
    typeof params.bandCount === "number" && Number.isFinite(params.bandCount)
      ? params.bandCount
      : 4;
  const count = Math.max(1, Math.min(8, Math.round(countRaw)));
  const bands: ParametricBand[] = [];
  for (let i = 0; i < count; i++) {
    const typeRaw = params[`band${i}Type`];
    const type =
      typeof typeRaw === "string" &&
      (PARAMETRIC_EQ_BAND_TYPES as readonly string[]).includes(typeRaw)
        ? (typeRaw as BiquadType)
        : i === 0
          ? "lowshelf"
          : i === count - 1
            ? "highshelf"
            : "peak";
    const freq =
      typeof params[`band${i}Freq`] === "number"
        ? (params[`band${i}Freq`] as number)
        : i === 0
          ? 100
          : i === count - 1
            ? 8000
            : 1000 * i;
    const gainDb =
      typeof params[`band${i}Gain`] === "number"
        ? (params[`band${i}Gain`] as number)
        : 0;
    const q =
      typeof params[`band${i}Q`] === "number"
        ? (params[`band${i}Q`] as number)
        : 0.7;
    const en = params[`band${i}Enabled`];
    bands.push({
      type,
      frequencyHz: freq,
      gainDb,
      q,
      enabled: en === false || en === 0 ? false : true,
    });
  }
  return bands;
}

export type DelayDivision =
  | "1/1"
  | "1/2"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1/2d"
  | "1/4d"
  | "1/8d"
  | "1/4t"
  | "1/8t";

export const DELAY_DIVISIONS: readonly DelayDivision[] = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/2d",
  "1/4d",
  "1/8d",
  "1/4t",
  "1/8t",
] as const;

export type DelayParams = {
  /** Free delay time in milliseconds when not tempo-synced. */
  delayMs: number;
  /** When true, use musical division + tempo. */
  sync: boolean;
  division: DelayDivision;
  /** Project / override tempo. Invalid → fall back to delayMs. */
  tempoBpm?: number | null;
  /** Feedback 0…0.95 (hard cap prevents runaway). */
  feedback: number;
  /** Wet amount 0…1. */
  mix: number;
};

/** Beat fraction for a musical division (quarter note = 1). */
export function delayDivisionBeats(division: DelayDivision): number {
  switch (division) {
    case "1/1":
      return 4;
    case "1/2":
      return 2;
    case "1/4":
      return 1;
    case "1/8":
      return 0.5;
    case "1/16":
      return 0.25;
    case "1/2d":
      return 3;
    case "1/4d":
      return 1.5;
    case "1/8d":
      return 0.75;
    case "1/4t":
      return 2 / 3;
    case "1/8t":
      return 1 / 3;
    default: {
      const _exhaustive: never = division;
      return _exhaustive;
    }
  }
}

/**
 * Resolve delay time in ms. Tempo-sync uses BPM when valid; otherwise free ms.
 * Always returns a finite clamped value so playback/export never stall.
 */
export function resolveDelayMs(params: Partial<DelayParams>): number {
  const freeMs = Math.max(
    1,
    Math.min(2000, Number.isFinite(params.delayMs) ? params.delayMs! : 350),
  );
  if (!params.sync) return freeMs;
  const bpm =
    typeof params.tempoBpm === "number" &&
    Number.isFinite(params.tempoBpm) &&
    params.tempoBpm > 0
      ? params.tempoBpm
      : null;
  if (bpm == null) return freeMs;
  const div =
    typeof params.division === "string" &&
    (DELAY_DIVISIONS as readonly string[]).includes(params.division)
      ? (params.division as DelayDivision)
      : "1/4";
  const ms = (60_000 / bpm) * delayDivisionBeats(div);
  return Math.max(1, Math.min(2000, ms));
}

/**
 * Approximate delay wet tail in frames so offline render does not truncate
 * the echo queue. Depends on delay time and feedback.
 */
export function delayTailFrames(
  delayMs: number,
  feedback: number,
  sampleRate: number,
): number {
  const fb = Math.max(0, Math.min(0.95, feedback));
  const dMs = Math.max(1, delayMs);
  // Decay until feedback^n ≈ 1e-4
  const n =
    fb <= 1e-6 ? 1 : Math.ceil(Math.log(1e-4) / Math.log(Math.max(fb, 1e-6)));
  const decaySec = (n * dMs) / 1000 + 0.05;
  return Math.ceil(decaySec * Math.max(1, sampleRate));
}

/**
 * Stereo tempo-syncable delay with bounded feedback and wet/dry mix.
 * Extends the buffer by {@link delayTailFrames}.
 */
export function applyDelay(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<DelayParams> = {},
): Float32Array {
  const delayMs = resolveDelayMs(params);
  const feedback = Math.max(
    0,
    Math.min(0.95, Number.isFinite(params.feedback) ? params.feedback! : 0.35),
  );
  const mix = Math.max(
    0,
    Math.min(1, Number.isFinite(params.mix) ? params.mix! : 0.35),
  );
  const sr = Math.max(1, sampleRate);
  const dryFrames = Math.floor(pcm.length / 2);
  const delaySamples = Math.max(1, Math.round((delayMs / 1000) * sr));
  const tail = delayTailFrames(delayMs, feedback, sr);
  const frames = dryFrames + tail;
  const out = new Float32Array(frames * 2);
  if (dryFrames === 0 || mix <= 1e-6) {
    out.set(pcm.subarray(0, Math.min(pcm.length, out.length)));
    return out;
  }

  const bufL = new Float32Array(delaySamples);
  const bufR = new Float32Array(delaySamples);
  let w = 0;
  const dryGain = 1 - mix;
  const wetGain = mix;

  for (let i = 0; i < frames; i++) {
    const dryL = i < dryFrames ? (pcm[i * 2] ?? 0) : 0;
    const dryR = i < dryFrames ? (pcm[i * 2 + 1] ?? dryL) : 0;
    const delayedL = bufL[w]!;
    const delayedR = bufR[w]!;
    bufL[w] = dryL + delayedL * feedback;
    bufR[w] = dryR + delayedR * feedback;
    w = (w + 1) % delaySamples;
    out[i * 2] = dryL * dryGain + delayedL * wetGain;
    out[i * 2 + 1] = dryR * dryGain + delayedR * wetGain;
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
