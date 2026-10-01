import { describe, expect, it } from "vitest";
import {
  applyPitchCorrect,
  createMixProductionToolkit,
  pitchCorrectAllowedPcs,
  snapMidiToScale,
} from "./index.js";

describe("pitch_correct", () => {
  it("snaps MIDI to major scale pitch classes", () => {
    const allowed = pitchCorrectAllowedPcs("scale", 0, "major");
    expect(allowed).toEqual([0, 2, 4, 5, 7, 9, 11]);
    // C# (61) → D (62) or C (60); nearest is C or D — 61-60=1, 62-61=1 → either
    const snapped = snapMidiToScale(61, allowed);
    expect([60, 62]).toContain(Math.round(snapped));
  });

  it("chromatic mode keeps all pitch classes", () => {
    expect(pitchCorrectAllowedPcs("chromatic", 0, "major")).toHaveLength(12);
  });

  it("processes via effects rack and respects enabled bypass", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.effects.insert("trk-vocals", {
      id: "fx-pc",
      kind: "pitch_correct",
      enabled: true,
      params: {
        mode: "chromatic",
        tonic: 0,
        scale: "major",
        intensity: 1,
        speed: 1,
        formantPreserve: true,
      },
    });

    // ~220 Hz sine (~A3) at 48 kHz, stereo interleaved, ~0.25 s
    const sr = 48000;
    const frames = Math.floor(sr * 0.25);
    const pcm = new Float32Array(frames * 2);
    const f0 = 220;
    for (let i = 0; i < frames; i++) {
      const s = 0.4 * Math.sin((2 * Math.PI * f0 * i) / sr);
      pcm[i * 2] = s;
      pcm[i * 2 + 1] = s;
    }

    const wet = toolkit.effects.process("trk-vocals", pcm, sr);
    expect(wet.length).toBe(pcm.length);
    expect(Math.max(...wet.map(Math.abs))).toBeGreaterThan(0.05);

    toolkit.effects.remove("trk-vocals", "fx-pc");
    toolkit.effects.insert("trk-vocals", {
      id: "fx-pc-off",
      kind: "pitch_correct",
      enabled: false,
      params: { intensity: 1, speed: 1 },
    });
    const dry = toolkit.effects.process("trk-vocals", pcm, sr);
    expect([...dry]).toEqual([...pcm]);
  });

  it("applyPitchCorrect intensity 0 returns a copy", () => {
    const pcm = new Float32Array([0.1, -0.1, 0.2, -0.2]);
    const out = applyPitchCorrect(pcm, 48000, { intensity: 0 });
    expect([...out]).toEqual([...pcm]);
    expect(out).not.toBe(pcm);
  });
});
