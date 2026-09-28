/**
 * Per-clip time-stretch (pitch preserved) + independent transpose (issue #95).
 *
 * WSOLA-style overlap-add stretch + OLA pitch shift in pure TS.
 * Not Rubber Band / SoundTouch — quality degrades on extreme ratios,
 * drums, and dense polyphony. Apache-2.0 in-repo.
 */

export type TimeStretchQualityHint =
  | "ok"
  | "voice_ok"
  | "drums_caution"
  | "polyphony_caution"
  | "extreme_ratio";

export type ClipAudioProcessParams = {
  /** Timeline length / source length. 1 = none. Clamped to [0.25, 4]. */
  timeStretchRatio: number;
  /** Independent pitch shift in semitones. 0 = none. Clamped to [-12, 12]. */
  pitchSemitones: number;
  /** Master bypass — when false, returns a copy of the input region. */
  enabled: boolean;
};

const MIN_RATIO = 0.25;
const MAX_RATIO = 4;
const MIN_SEMITONES = -12;
const MAX_SEMITONES = 12;

export function clampStretchRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
}

export function clampPitchSemitones(semitones: number): number {
  if (!Number.isFinite(semitones)) return 0;
  return Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, semitones));
}

/**
 * Effective stretch when following project tempo.
 * Faster project tempo → shorter clip (ratio < 1).
 */
export function stretchRatioFromTempos(
  sourceTempoBpm: number | null | undefined,
  projectTempoBpm: number | null | undefined,
): number | null {
  if (
    typeof sourceTempoBpm !== "number" ||
    typeof projectTempoBpm !== "number" ||
    !Number.isFinite(sourceTempoBpm) ||
    !Number.isFinite(projectTempoBpm) ||
    sourceTempoBpm <= 0 ||
    projectTempoBpm <= 0
  ) {
    return null;
  }
  return clampStretchRatio(sourceTempoBpm / projectTempoBpm);
}

export function resolveClipStretchRatio(opts: {
  processingEnabled?: boolean;
  followProjectTempo?: boolean;
  sourceTempoBpm?: number | null;
  projectTempoBpm?: number | null;
  timeStretchRatio?: number | null;
}): number {
  if (opts.processingEnabled === false) return 1;
  if (opts.followProjectTempo) {
    const fromTempo = stretchRatioFromTempos(
      opts.sourceTempoBpm,
      opts.projectTempoBpm,
    );
    if (fromTempo != null) return fromTempo;
  }
  if (
    typeof opts.timeStretchRatio === "number" &&
    Number.isFinite(opts.timeStretchRatio)
  ) {
    return clampStretchRatio(opts.timeStretchRatio);
  }
  return 1;
}

export function qualityHintForProcess(
  ratio: number,
  semitones: number,
  material: "voice" | "drums" | "polyphony" | "other" = "other",
): TimeStretchQualityHint {
  const r = clampStretchRatio(ratio);
  const s = Math.abs(clampPitchSemitones(semitones));
  if (r < 0.5 || r > 2 || s > 7) return "extreme_ratio";
  if (material === "drums" && (r < 0.85 || r > 1.15 || s > 0)) {
    return "drums_caution";
  }
  if (material === "polyphony" && (r < 0.9 || r > 1.1 || s > 2)) {
    return "polyphony_caution";
  }
  if (material === "voice") return "voice_ok";
  return "ok";
}

function hann(i: number, n: number): number {
  if (n <= 1) return 1;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
}

function sampleAt(buf: Float32Array, index: number): number {
  if (index < 0 || index >= buf.length - 1) {
    if (index < 0 || buf.length === 0) return 0;
    return buf[buf.length - 1] ?? 0;
  }
  const i0 = Math.floor(index);
  const frac = index - i0;
  const a = buf[i0] ?? 0;
  const b = buf[i0 + 1] ?? a;
  return a + (b - a) * frac;
}

/**
 * WSOLA-ish stretch: hop synthesis fixed, search input for best correlation.
 */
export function timeStretchMono(
  input: Float32Array,
  ratio: number,
  sampleRate: number,
): Float32Array {
  const r = clampStretchRatio(ratio);
  if (Math.abs(r - 1) < 1e-4 || input.length < 32) {
    return new Float32Array(input);
  }
  const outLen = Math.max(1, Math.round(input.length * r));
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);

  const windowMs = 40;
  const win = Math.max(
    64,
    Math.min(input.length, Math.round((windowMs / 1000) * sampleRate)),
  );
  const hopOut = Math.max(16, Math.floor(win / 4));
  const hopIn = hopOut / r;
  const search = Math.max(8, Math.floor(win / 4));

  let inPos = 0;
  let outPos = 0;
  while (outPos < outLen) {
    let best = inPos;
    let bestCorr = -Infinity;
    const lo = Math.max(0, Math.floor(inPos) - search);
    const hi = Math.min(
      input.length - win,
      Math.floor(inPos) + search,
    );
    if (hi >= lo && outPos > 0) {
      for (let cand = lo; cand <= hi; cand++) {
        let corr = 0;
        const overlap = Math.min(win, outLen - outPos);
        for (let i = 0; i < overlap; i++) {
          corr += (out[outPos + i] ?? 0) * (input[cand + i] ?? 0);
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          best = cand;
        }
      }
    } else {
      best = Math.max(0, Math.min(input.length - win, Math.floor(inPos)));
    }

    for (let i = 0; i < win && outPos + i < outLen; i++) {
      const w = hann(i, win);
      const s = input[best + i] ?? 0;
      out[outPos + i]! += s * w;
      norm[outPos + i]! += w;
    }
    outPos += hopOut;
    inPos += hopIn;
    if (best + win >= input.length && outPos < outLen) {
      // Drain remaining with linear resample of the tail.
      break;
    }
  }

  for (let i = 0; i < outLen; i++) {
    const n = norm[i] ?? 0;
    out[i] = n > 1e-8 ? (out[i] ?? 0) / n : 0;
  }

  // If we ended early, fill remainder by reading input scaled.
  if (outPos < outLen) {
    for (let i = outPos; i < outLen; i++) {
      const src = (i / r);
      out[i] = sampleAt(input, src);
    }
  }
  return out;
}

/** Pitch shift via resample then stretch back (duration preserved). */
export function pitchShiftMono(
  input: Float32Array,
  semitones: number,
  sampleRate: number,
): Float32Array {
  const st = clampPitchSemitones(semitones);
  if (Math.abs(st) < 1e-4 || input.length < 32) {
    return new Float32Array(input);
  }
  const rate = Math.pow(2, st / 12);
  const resampledLen = Math.max(1, Math.round(input.length / rate));
  const resampled = new Float32Array(resampledLen);
  for (let i = 0; i < resampledLen; i++) {
    resampled[i] = sampleAt(input, i * rate);
  }
  // Stretch back to original length (pitch stays shifted).
  return timeStretchMono(resampled, input.length / resampled.length, sampleRate);
}

export function processClipChannel(
  input: Float32Array,
  params: ClipAudioProcessParams,
  sampleRate: number,
): Float32Array {
  if (!params.enabled) {
    return new Float32Array(input);
  }
  const ratio = clampStretchRatio(params.timeStretchRatio);
  const semitones = clampPitchSemitones(params.pitchSemitones);
  let buf = input;
  if (Math.abs(ratio - 1) >= 1e-4) {
    buf = timeStretchMono(buf, ratio, sampleRate);
  }
  if (Math.abs(semitones) >= 1e-4) {
    buf = pitchShiftMono(buf, semitones, sampleRate);
  }
  return buf;
}

/**
 * Extract source region and apply stretch/pitch so output length ≈ timeline frames.
 */
export function processClipRegion(
  srcLeft: Float32Array,
  srcRight: Float32Array,
  offsetSamples: number,
  /** Unstretched source length to read (samples). */
  sourceFrames: number,
  params: ClipAudioProcessParams,
  sampleRate: number,
): { left: Float32Array; right: Float32Array } {
  const start = Math.max(0, offsetSamples);
  const frames = Math.max(1, sourceFrames);
  const leftIn = new Float32Array(frames);
  const rightIn = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    leftIn[i] = srcLeft[start + i] ?? 0;
    rightIn[i] = srcRight[start + i] ?? 0;
  }
  if (!params.enabled) {
    return { left: leftIn, right: rightIn };
  }
  return {
    left: processClipChannel(leftIn, params, sampleRate),
    right: processClipChannel(rightIn, params, sampleRate),
  };
}
