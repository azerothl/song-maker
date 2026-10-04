import { describe, expect, it } from "vitest";
import {
  applyVoiceCleanup,
  createMixProductionToolkit,
  voiceCleanupPeakDb,
} from "./index.js";

function tonePlusNoise(
  frames: number,
  sr: number,
  toneHz: number,
  toneAmp: number,
  noiseAmp: number,
): Float32Array {
  const pcm = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const t = i / sr;
    const tone = Math.sin(2 * Math.PI * toneHz * t) * toneAmp;
    const n = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2 - 1;
    const s = tone + n * noiseAmp;
    pcm[i * 2] = s;
    pcm[i * 2 + 1] = s;
  }
  return pcm;
}

describe("voice_cleanup", () => {
  it("reduces stationary noise floor while keeping a mid tone present", () => {
    const sr = 16000;
    const frames = sr;
    const noisy = tonePlusNoise(frames, sr, 220, 0.35, 0.08);
    const cleaned = applyVoiceCleanup(noisy, sr, {
      strength: 0.85,
      noiseFloorDb: -28,
      preserveAttack: 0.2,
    });
    expect(cleaned.length).toBe(noisy.length);

    const rms = (pcm: Float32Array, start: number, end: number) => {
      let sum = 0;
      let n = 0;
      for (let i = start; i < end; i++) {
        const v = pcm[i] ?? 0;
        sum += v * v;
        n++;
      }
      return Math.sqrt(sum / Math.max(1, n));
    };
    const mid = Math.floor(noisy.length * 0.4);
    const end = Math.floor(noisy.length * 0.9);
    const wetRms = rms(cleaned, mid, end);
    const dryRms = rms(noisy, mid, end);
    expect(wetRms).toBeLessThanOrEqual(dryRms * 1.05);
    expect(voiceCleanupPeakDb(cleaned)).toBeGreaterThan(-60);
  });

  it("bypasses when strength is 0 (bit-identical length, near-dry)", () => {
    const sr = 16000;
    const pcm = tonePlusNoise(sr / 2, sr, 440, 0.2, 0.05);
    const out = applyVoiceCleanup(pcm, sr, {
      strength: 0,
      noiseFloorDb: -40,
      preserveAttack: 0.5,
    });
    expect(out.length).toBe(pcm.length);
    let maxDiff = 0;
    for (let i = 0; i < pcm.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs((out[i] ?? 0) - (pcm[i] ?? 0)));
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it("rack process applies voice_cleanup insert", () => {
    const toolkit = createMixProductionToolkit();
    const sr = 16000;
    const pcm = tonePlusNoise(sr / 4, sr, 330, 0.25, 0.06);
    toolkit.effects.insert("trk-vocals", {
      id: "fx-vc",
      kind: "voice_cleanup",
      enabled: true,
      params: { strength: 0.7, noiseFloorDb: -36, preserveAttack: 0.5 },
    });
    const wet = toolkit.effects.process("trk-vocals", pcm, sr);
    expect(wet.length).toBe(pcm.length);
    toolkit.effects.insert("trk-vocals", {
      id: "fx-convert",
      kind: "voice_convert",
      enabled: true,
      params: { consentOwnVoice: false },
    });
    const still = toolkit.effects.process("trk-vocals", pcm, sr);
    expect(still.length).toBe(pcm.length);
    toolkit.effects.remove("trk-vocals", "fx-convert");
    toolkit.effects.insert("trk-vocals", {
      id: "fx-convert-ok",
      kind: "voice_convert",
      enabled: true,
      params: { consentOwnVoice: true },
    });
    expect(() => toolkit.effects.process("trk-vocals", pcm, sr)).toThrow(
      /VOICE_CONVERT_NO_REFERENCE/,
    );
  });

  it("disabled voice_cleanup leaves signal unchanged via rack", () => {
    const toolkit = createMixProductionToolkit();
    const sr = 16000;
    const pcm = tonePlusNoise(2000, sr, 200, 0.3, 0.04);
    toolkit.effects.insert("trk-vocals", {
      id: "fx-off",
      kind: "voice_cleanup",
      enabled: false,
      params: { strength: 1, noiseFloorDb: -20, preserveAttack: 0 },
    });
    const out = toolkit.effects.process("trk-vocals", pcm, sr);
    expect(out).toEqual(pcm);
  });
});
