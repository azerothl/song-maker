import { describe, expect, it } from "vitest";
import {
  bakeAlignedStems,
  createMixProductionToolkit,
  defaultBus,
  defaultSend,
  effectParamTarget,
  renderMixOffline,
  stableStemFileNames,
} from "./index.js";

describe("routing render + FX automation (#98)", () => {
  it("sums a post-fader send into an aux return", () => {
    const toolkit = createMixProductionToolkit();
    const aux = defaultBus("aux", "Room");
    aux.gainDb = 0;
    const send = defaultSend("trk-a", aux.id, {
      gainDb: 0,
      preFader: false,
    });
    const frames = 64;
    const left = new Float32Array(frames).fill(0.5);
    const right = new Float32Array(frames).fill(0.5);

    const dry = renderMixOffline({
      mixId: "mix-1",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-a",
          left,
          right,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    });

    const wet = renderMixOffline({
      mixId: "mix-1",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-a",
          left,
          right,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
      buses: [aux],
      sends: [send],
      effects: toolkit.effects,
    });

    // Direct + aux return ≈ louder than direct alone.
    expect(Math.abs(wet.left[0]!)).toBeGreaterThan(Math.abs(dry.left[0]!));
    expect(wet.path).toBe("production");
  });

  it("routes a track through a group bus without changing source clips", () => {
    const group = defaultBus("group", "Band");
    group.gainDb = -6;
    const frames = 32;
    const left = new Float32Array(frames).fill(1);
    const right = new Float32Array(frames).fill(1);

    const direct = renderMixOffline({
      mixId: "mix-g",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-g",
          left,
          right,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    });

    const grouped = renderMixOffline({
      mixId: "mix-g",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-g",
          left,
          right,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
      buses: [group],
      trackGroupIds: { "trk-g": group.id },
    });

    expect(Math.abs(grouped.left[0]!)).toBeLessThan(Math.abs(direct.left[0]!));
    expect(grouped.path).toBe("production");
  });

  it("applies FX param automation mid-buffer", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.effects.insert("trk-eq", {
      id: "fx-eq",
      kind: "eq",
      enabled: true,
      params: { gainDb: 0 },
    });
    const target = effectParamTarget("fx-eq", "gainDb");
    toolkit.automation.setLane("mix-fx", {
      trackId: "trk-eq",
      target,
      points: [
        { timeMs: 0, value: 0 },
        { timeMs: 1000, value: 12 },
      ],
    });

    const sr = 48000;
    const frames = sr; // 1 s
    const left = new Float32Array(frames).fill(0.1);
    const right = new Float32Array(frames).fill(0.1);
    const out = renderMixOffline({
      mixId: "mix-fx",
      sampleRate: sr,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-eq",
          left,
          right,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
      automation: toolkit.automation,
      effects: toolkit.effects,
    });

    const early = Math.abs(out.left[100]!);
    const late = Math.abs(out.left[frames - 100]!);
    expect(late).toBeGreaterThan(early * 1.5);
  });
});

describe("aligned stems (#99)", () => {
  it("builds collision-free stable names", () => {
    const names = stableStemFileNames([
      { trackId: "a", role: "vocals", name: "Voix" },
      { trackId: "b", role: "vocals", name: "Voix" },
    ]);
    expect(names.get("a")).toMatch(/^01_vocals_Voix$/);
    expect(names.get("b")).toMatch(/^02_vocals_Voix/);
    expect(names.get("a")).not.toBe(names.get("b"));
  });

  it("pads stems to a common origin and equal length", () => {
    const short = new Float32Array(10).fill(0.4);
    const long = new Float32Array(40).fill(0.3);
    const result = bakeAlignedStems({
      mixId: "mix-stems",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: 0,
      tracks: [
        {
          trackId: "trk-a",
          left: short,
          right: short,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          trackId: "trk-b",
          left: long,
          right: long,
          gainDb: 0,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
      trackMeta: [
        { trackId: "trk-a", role: "vocals", name: "Vox" },
        { trackId: "trk-b", role: "drums", name: "Drums" },
      ],
      selectedTrackIds: ["trk-a", "trk-b"],
      includeMaster: true,
    });

    expect(result.stems).toHaveLength(2);
    expect(result.stems[0]!.frameCount).toBe(result.stems[1]!.frameCount);
    expect(result.stems[0]!.frameCount).toBe(result.frameCount);
    expect(result.master?.frameCount).toBe(result.frameCount);
    // Leading samples present (origin t=0), short stem zero-padded at end.
    expect(result.stems[0]!.pcm[0]).not.toBe(0);
  });
});
