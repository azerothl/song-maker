import { describe, expect, it } from "vitest";
import {
  bandEnergy,
  suppressPianoBleed,
  HTDEMUCS_6S_PIANO_WARNING_FR,
} from "./pianoBleed.js";

function stereoSine(frames: number, sr: number, hz: number, amp: number): Float32Array {
  const pcm = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * hz * i) / sr) * amp;
    pcm[i * 2] = s;
    pcm[i * 2 + 1] = s;
  }
  return pcm;
}

function addNoise(pcm: Float32Array, amp: number): Float32Array {
  const out = new Float32Array(pcm);
  for (let i = 0; i < out.length; i++) {
    const n = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2 - 1;
    out[i] = (out[i] ?? 0) + n * amp;
  }
  return out;
}

describe("HTDemucs 6s piano bleed mask", () => {
  it("reduces 440 Hz leak in a drums-like stem vs the piano stem", () => {
    const sr = 16000;
    const frames = sr;
    const piano = stereoSine(frames, sr, 440, 0.4);
    const drums = addNoise(stereoSine(frames, sr, 440, 0.18), 0.05);
    const before = bandEnergy(drums, sr, 440);
    const afterPcm = suppressPianoBleed(drums, piano, 1);
    const after = bandEnergy(afterPcm, sr, 440);
    expect(after).toBeLessThan(before * 0.7);
    expect(HTDEMUCS_6S_PIANO_WARNING_FR).toMatch(/piano-heavy/);
  });

  it("strength 0 leaves the other stem unchanged", () => {
    const sr = 8000;
    const drums = stereoSine(sr, sr, 220, 0.2);
    const piano = stereoSine(sr, sr, 440, 0.2);
    expect(suppressPianoBleed(drums, piano, 0)).toEqual(drums);
  });
});
