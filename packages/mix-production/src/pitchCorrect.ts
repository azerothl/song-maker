/**
 * Light local pitch corrector for vocal stems (issue #83).
 *
 * Autocorrelation / AMDF-style F0 + overlap-add pitch shift in pure TS.
 * Not commercial Autotune: formantPreserve is a mild HF shelf compensation,
 * not LPC formant locking. Apache-2.0 in-repo — no native pitch SDK.
 */

export type PitchCorrectMode = "chromatic" | "scale";
export type PitchCorrectScale = "major" | "minor";

export type PitchCorrectParams = {
  /** Snap target: all 12 PCs, or diatonic scale from tonic. */
  mode: PitchCorrectMode;
  /** Pitch-class of tonic (C=0 … B=11). Ignored for chromatic. */
  tonic: number;
  /** Scale when mode === "scale". */
  scale: PitchCorrectScale;
  /** 0 = dry, 1 = full snap to target. */
  intensity: number;
  /** 0 = slow glide, 1 = fast correction (less lag). */
  speed: number;
  /**
   * Mild brightness compensation after shift (not true formant lock).
   * Keeps timbre slightly more natural on large corrections.
   */
  formantPreserve: boolean;
};

const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_PCS = [0, 2, 3, 5, 7, 8, 10] as const;

const MIN_F0 = 70;
const MAX_F0 = 1000;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Allowed pitch classes for the chosen mode / tonic / scale. */
export function pitchCorrectAllowedPcs(
  mode: PitchCorrectMode,
  tonic: number,
  scale: PitchCorrectScale,
): number[] {
  if (mode === "chromatic") {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }
  const base = scale === "minor" ? MINOR_PCS : MAJOR_PCS;
  const t = ((Math.round(tonic) % 12) + 12) % 12;
  return base.map((pc) => (pc + t) % 12);
}

/** Snap MIDI continuous pitch to nearest allowed pitch class (same octave). */
export function snapMidiToScale(
  midi: number,
  allowedPcs: readonly number[],
): number {
  if (!Number.isFinite(midi) || allowedPcs.length === 0) return midi;
  const octave = Math.floor(midi / 12);
  const frac = midi - Math.floor(midi);
  let best = midi;
  let bestDist = Infinity;
  for (const pc of allowedPcs) {
    for (const oct of [octave - 1, octave, octave + 1]) {
      const candidate = oct * 12 + pc + frac;
      const d = Math.abs(candidate - midi);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
  }
  return best;
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * AMDF-style F0 estimate on a mono frame. Returns null if unvoiced / silent.
 */
export function estimateF0Hz(
  mono: Float32Array,
  sampleRate: number,
  offset: number,
  frameSize: number,
): number | null {
  const n = Math.min(frameSize, mono.length - offset);
  if (n < 64) return null;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const s = mono[offset + i] ?? 0;
    energy += s * s;
  }
  if (energy / n < 1e-6) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_F0));
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / MIN_F0));
  if (maxLag <= minLag) return null;

  let bestLag = minLag;
  let bestDiff = Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let diff = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      const a = mono[offset + i] ?? 0;
      const b = mono[offset + i + lag] ?? 0;
      diff += Math.abs(a - b);
    }
    diff /= count;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestLag = lag;
    }
  }

  // Reject weak periodicity (noise / unvoiced).
  const rms = Math.sqrt(energy / n);
  if (bestDiff > rms * 0.85) return null;

  const f0 = sampleRate / bestLag;
  if (f0 < MIN_F0 || f0 > MAX_F0) return null;
  return f0;
}

function hann(i: number, n: number): number {
  if (n <= 1) return 1;
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
}

function applyShelf(
  pcm: Float32Array,
  sampleRate: number,
  gainDb: number,
): Float32Array {
  if (Math.abs(gainDb) < 0.05) return pcm;
  // One-pole shelf-ish: mix highpassed content.
  const g = 10 ** (gainDb / 20);
  const cutoff = 2500;
  const alpha = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  const out = new Float32Array(pcm.length);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const l = pcm[i] ?? 0;
    const r = pcm[i + 1] ?? l;
    lpL = alpha * lpL + (1 - alpha) * l;
    lpR = alpha * lpR + (1 - alpha) * r;
    const hpL = l - lpL;
    const hpR = r - lpR;
    out[i] = lpL + hpL * g;
    if (i + 1 < pcm.length) out[i + 1] = lpR + hpR * g;
  }
  return out;
}

/**
 * Correct pitch of interleaved stereo PCM toward chromatic or scale targets.
 * Same buffer length out (no tail). Unvoiced regions pass through.
 */
export function applyPitchCorrect(
  pcm: Float32Array,
  sampleRate: number,
  params: Partial<PitchCorrectParams> = {},
): Float32Array {
  const mode: PitchCorrectMode =
    params.mode === "scale" ? "scale" : "chromatic";
  const tonic = clamp(Math.round(params.tonic ?? 0), 0, 11);
  const scale: PitchCorrectScale =
    params.scale === "minor" ? "minor" : "major";
  const intensity = clamp01(params.intensity ?? 0.7);
  const speed = clamp01(params.speed ?? 0.55);
  const formantPreserve = Boolean(params.formantPreserve ?? true);

  if (intensity <= 1e-4 || pcm.length < 4) {
    return new Float32Array(pcm);
  }

  const sr = Math.max(1, sampleRate);
  const frames = Math.floor(pcm.length / 2);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = pcm[i * 2] ?? 0;
    const r = pcm[i * 2 + 1] ?? l;
    mono[i] = 0.5 * (l + r);
  }

  const frameSize = Math.max(256, Math.round(sr * 0.04)); // ~40 ms
  const hop = Math.max(64, Math.floor(frameSize / 4));
  const allowed = pitchCorrectAllowedPcs(mode, tonic, scale);

  // Smoothed correction ratio per hop (readRate = detected/target).
  const ratios: number[] = [];
  let smoothMidi: number | null = null;
  const lagAlpha = 0.15 + speed * 0.8; // higher speed → track target faster

  for (let start = 0; start < frames; start += hop) {
    const f0 = estimateF0Hz(mono, sr, start, frameSize);
    if (f0 == null) {
      ratios.push(1);
      continue;
    }
    const midi = hzToMidi(f0);
    const snapped = snapMidiToScale(midi, allowed);
    const correctedMidi = midi + (snapped - midi) * intensity;
    if (smoothMidi == null) {
      smoothMidi = correctedMidi;
    } else {
      smoothMidi = smoothMidi + (correctedMidi - smoothMidi) * lagAlpha;
    }
    const targetHz = midiToHz(smoothMidi);
    const ratio = clamp(f0 / Math.max(1e-6, targetHz), 0.5, 2);
    ratios.push(ratio);
  }

  // Overlap-add resynthesis with per-hop read ratio.
  const out = new Float32Array(pcm.length);
  const weight = new Float32Array(frames);
  const win = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) win[i] = hann(i, frameSize);

  for (let hopIndex = 0; hopIndex < ratios.length; hopIndex++) {
    const writeStart = hopIndex * hop;
    const ratio = ratios[hopIndex]!;
    for (let i = 0; i < frameSize; i++) {
      const outIdx = writeStart + i;
      if (outIdx >= frames) break;
      const srcPos = writeStart + i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = i0 + 1;
      const frac = srcPos - i0;
      const w = win[i]!;
      for (let ch = 0; ch < 2; ch++) {
        const s0 = i0 >= 0 && i0 < frames ? (pcm[i0 * 2 + ch] ?? 0) : 0;
        const s1 = i1 >= 0 && i1 < frames ? (pcm[i1 * 2 + ch] ?? 0) : 0;
        const sample = s0 + (s1 - s0) * frac;
        out[outIdx * 2 + ch] = (out[outIdx * 2 + ch] ?? 0) + sample * w;
      }
      weight[outIdx] = (weight[outIdx] ?? 0) + w;
    }
  }

  for (let i = 0; i < frames; i++) {
    const w = weight[i]!;
    if (w > 1e-8) {
      out[i * 2] = (out[i * 2] ?? 0) / w;
      out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) / w;
    } else {
      out[i * 2] = pcm[i * 2] ?? 0;
      out[i * 2 + 1] = pcm[i * 2 + 1] ?? 0;
    }
  }

  if (!formantPreserve) return out;

  // Approximate formant help: boost/cut highs when average |cents| shift is large.
  let meanAbsLog = 0;
  let count = 0;
  for (const r of ratios) {
    if (Math.abs(r - 1) < 1e-4) continue;
    meanAbsLog += Math.abs(Math.log2(r));
    count += 1;
  }
  if (count === 0) return out;
  const meanSemis = (meanAbsLog / count) * 12;
  // Pitching up compresses formants → brighten a little when corrected down, etc.
  const shelfDb = clamp(-meanSemis * 0.35, -3, 3);
  return applyShelf(out, sr, shelfDb);
}
