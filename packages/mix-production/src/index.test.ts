import { describe, expect, it } from "vitest";
import {
  applyPeakLimiter,
  createMixProductionToolkit,
  measureLoudnessFromPcm,
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
});
