import { describe, expect, it } from "vitest";
import {
  applyVoiceConvert,
  applyVoiceDenoise,
  extractSpectralEnvelope,
  serializeEnvelope,
  VOICE_CONVERT_NO_REFERENCE,
} from "./index.js";

function stereoTone(
  frames: number,
  sr: number,
  hz: number,
  amp: number,
): Float32Array {
  const pcm = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * hz * i) / sr) * amp;
    pcm[i * 2] = s;
    pcm[i * 2 + 1] = s;
  }
  return pcm;
}

function stereoTonePlusNoise(
  frames: number,
  sr: number,
  hz: number,
  amp: number,
  noiseAmp: number,
): Float32Array {
  const pcm = stereoTone(frames, sr, hz, amp);
  for (let i = 0; i < frames; i++) {
    const n = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2 - 1;
    pcm[i * 2]! += n * noiseAmp;
    pcm[i * 2 + 1]! += n * noiseAmp;
  }
  return pcm;
}

function bandEnergy(pcm: Float32Array, sr: number, hz: number): number {
  const frames = pcm.length / 2;
  let re = 0;
  let im = 0;
  for (let i = 0; i < frames; i++) {
    const s = 0.5 * ((pcm[i * 2] ?? 0) + (pcm[i * 2 + 1] ?? 0));
    const a = (2 * Math.PI * hz * i) / sr;
    re += s * Math.cos(a);
    im += s * Math.sin(a);
  }
  return Math.hypot(re, im) / frames;
}

describe("voice_convert envelope", () => {
  it("pass-through without consent", () => {
    const sr = 16000;
    const pcm = stereoTone(sr, sr, 440, 0.3);
    const out = applyVoiceConvert(pcm, sr, { consentOwnVoice: false, mix: 1 });
    expect(out).toEqual(pcm);
  });

  it("throws when consent is on but no reference envelope", () => {
    const sr = 16000;
    const pcm = stereoTone(sr, sr, 220, 0.2);
    expect(() =>
      applyVoiceConvert(pcm, sr, { consentOwnVoice: true, mix: 0.8 }),
    ).toThrow(VOICE_CONVERT_NO_REFERENCE);
  });

  it("shifts energy toward a brighter reference envelope", () => {
    const sr = 16000;
    const dull = stereoTone(sr, sr, 180, 0.35);
    const bright = stereoTone(sr, sr, 1800, 0.35);
    const env = extractSpectralEnvelope(bright, sr);
    const serialized = serializeEnvelope(env);
    expect(serialized.split(",").length).toBeGreaterThanOrEqual(8);
    const wet = applyVoiceConvert(dull, sr, {
      consentOwnVoice: true,
      mix: 1,
      targetEnvelope: serialized,
    });
    expect(wet.length).toBe(dull.length);
    const dullHigh = bandEnergy(dull, sr, 1800);
    const wetHigh = bandEnergy(wet, sr, 1800);
    expect(wetHigh).toBeGreaterThan(dullHigh);
  });
});

describe("voice_denoise statistical", () => {
  it("reduces noise-only region energy", () => {
    const sr = 16000;
    const pcm = stereoTonePlusNoise(sr, sr, 330, 0.25, 0.12);
    const wet = applyVoiceDenoise(pcm, sr, { strength: 0.9 });
    const rms = (buf: Float32Array) => {
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += (buf[i] ?? 0) ** 2;
      return Math.sqrt(s / buf.length);
    };
    expect(rms(wet)).toBeLessThan(rms(pcm));
  });

  it("strength 0 is dry copy", () => {
    const sr = 16000;
    const pcm = stereoTonePlusNoise(sr / 2, sr, 440, 0.2, 0.05);
    const out = applyVoiceDenoise(pcm, sr, { strength: 0 });
    expect(out).toEqual(pcm);
  });
});
