import { describe, expect, it } from "vitest";
import {
  applyPeakLimiter,
  createMixProductionToolkit,
  measureLoudnessFromPcm,
  placeClipsOnTimeline,
  renderMixOffline,
  sampleAutomationPoints,
} from "./index.js";

describe("mix-production real subset", () => {
  it("interpolates automation lanes", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.automation.setLane("mix-v001", {
      trackId: "trk-vocals",
      target: "volume",
      points: [
        { timeMs: 0, value: 0 },
        { timeMs: 1000, value: -6 },
      ],
    });
    expect(toolkit.automation.listLanes("mix-v001")).toHaveLength(1);
    expect(
      toolkit.automation.sampleAt("mix-v001", "trk-vocals", "volume", 500),
    ).toBeCloseTo(-3, 5);
    expect(sampleAutomationPoints([{ timeMs: 0, value: 1 }], 100)).toBe(1);
  });

  it("runs compressor / limiter process on PCM", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.effects.insert("trk-drums", {
      id: "fx-lim",
      kind: "limiter",
      enabled: true,
      params: { ceilingDb: -1 },
    });
    toolkit.effects.insert("trk-drums", {
      id: "fx-comp",
      kind: "compressor",
      enabled: true,
      params: { thresholdDb: -12, ratio: 4 },
    });
    const hot = new Float32Array([0.99, 0.99, -0.95, 0.95]);
    const out = toolkit.effects.process("trk-drums", hot);
    expect(out.length).toBe(4);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1);
    const limited = applyPeakLimiter(new Float32Array([1.2, -1.2]), 0.89);
    expect(Math.abs(limited[0]!)).toBeLessThan(1);
  });

  it("ducks destination via sidechain and measures loudness from PCM", async () => {
    const toolkit = createMixProductionToolkit();
    toolkit.sidechain.upsert("mix-v001", {
      id: "sc-1",
      sourceTrackId: "trk-drums",
      destinationTrackId: "trk-bass",
      thresholdDb: -24,
      ratio: 4,
      enabled: true,
    });
    expect(toolkit.sidechain.listRoutes("mix-v001")).toHaveLength(1);

    const drums = new Float32Array([0.8, 0.8, 0.8, 0.8]);
    const bass = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const ducked = toolkit.sidechain.applyDucking(
      "mix-v001",
      "trk-bass",
      bass,
      new Map([["trk-drums", drums]]),
    );
    expect(Math.abs(ducked[0]!)).toBeLessThan(Math.abs(bass[0]!));

    const report = toolkit.loudness.measurePcm(
      new Float32Array([0.5, -0.5, 0.25, -0.25]),
      48000,
      "ebu_r128",
    );
    expect(report.truePeakDbfs).not.toBeNull();
    expect(report.integratedLufs).not.toBeNull();
    expect(report.truePeakDbfs!).toBeCloseTo(measureLoudnessFromPcm(
      new Float32Array([0.5, -0.5, 0.25, -0.25]),
      48000,
    ).truePeakDbfs, 5);

    const none = await toolkit.loudness.measure("/tmp/mix.wav", "none");
    expect(none.integratedLufs).toBeNull();
  });

  it("renderMixOffline applies automation + limiter consistently", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.automation.setLane("mix-v001", {
      trackId: "trk-a",
      target: "volume",
      points: [
        { timeMs: 0, value: 0 },
        { timeMs: 1000, value: -12 },
      ],
    });
    toolkit.effects.insert("trk-a", {
      id: "lim",
      kind: "limiter",
      enabled: true,
      params: { ceilingDb: -1 },
    });
    const left = new Float32Array(48000);
    const right = new Float32Array(48000);
    left.fill(0.5);
    right.fill(0.5);
    const out = renderMixOffline({
      mixId: "mix-v001",
      sampleRate: 48000,
      masterGainDb: 0,
      peakCeilingDb: -1,
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
      automation: toolkit.automation,
      effects: toolkit.effects,
      sidechain: toolkit.sidechain,
    });
    expect(out.path).toBe("production");
    expect(out.frameCount).toBe(48000);
    expect(out.pcm.length).toBe(96000);
    // Midpoint ~ -6 dB vs start → quieter at end.
    const startPeak = Math.abs(out.left[0]!);
    const endPeak = Math.abs(out.left[47999]!);
    expect(endPeak).toBeLessThan(startPeak * 0.5);
  });

  it("places clips on a timeline with fades", () => {
    const src = new Float32Array(100);
    src.fill(1);
    const { left, frameCount } = placeClipsOnTimeline(
      src,
      src,
      [
        {
          startMs: 0,
          offsetMs: 0,
          durationMs: 10,
          fadeInMs: 5,
          fadeOutMs: 0,
          gainDb: 0,
        },
      ],
      1000,
    );
    expect(frameCount).toBe(10);
    expect(left[0]!).toBeCloseTo(0, 5);
    expect(left[9]!).toBeCloseTo(1, 5);
  });
});
