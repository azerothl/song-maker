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

  it("applies stereo reverb with a measurable wet tail", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.effects.insert("trk-vox", {
      id: "fx-rev",
      kind: "reverb",
      enabled: true,
      params: { mix: 0.7, roomSize: 0.8, damping: 0.3, width: 1 },
    });
    const sr = 48000;
    const frames = 2000;
    const dry = new Float32Array(frames * 2);
    for (let i = 0; i < 200; i++) {
      dry[i * 2] = Math.sin((i / sr) * 2 * Math.PI * 440);
      dry[i * 2 + 1] = dry[i * 2]!;
    }
    const wet = toolkit.effects.process("trk-vox", dry, sr);
    expect(wet.length).toBeGreaterThan(dry.length);
    // Energy after the dry impulse must be non-zero (reverb queue).
    let tailEnergy = 0;
    for (let i = frames; i < wet.length / 2; i++) {
      tailEnergy += (wet[i * 2] ?? 0) ** 2 + (wet[i * 2 + 1] ?? 0) ** 2;
    }
    expect(tailEnergy).toBeGreaterThan(1e-6);
    // Higher mix → louder wet relative to dry mix=0 path.
    toolkit.effects.remove("trk-vox", "fx-rev");
    toolkit.effects.insert("trk-vox", {
      id: "fx-rev-dry",
      kind: "reverb",
      enabled: true,
      params: { mix: 0, roomSize: 0.8, damping: 0.3, width: 1 },
    });
    const nearlyDry = toolkit.effects.process("trk-vox", dry, sr);
    const peakWet = Math.max(...wet.subarray(0, dry.length).map(Math.abs));
    const peakDryMix = Math.max(
      ...nearlyDry.subarray(0, dry.length).map(Math.abs),
    );
    expect(peakWet).not.toBeCloseTo(peakDryMix, 3);
  });

  it("refuses unsupported custom effects instead of silent no-op", () => {
    const toolkit = createMixProductionToolkit();
    expect(() =>
      toolkit.effects.insert("trk-a", {
        id: "fx-custom",
        kind: "custom",
        enabled: true,
        params: { processorId: "missing-plugin" },
      }),
    ).toThrow(/non supporté|extension/i);

    toolkit.effects.registerCustomProcessor("gain2x", (pcm) => {
      const out = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] ?? 0) * 2;
      return out;
    });
    toolkit.effects.insert("trk-a", {
      id: "fx-custom-ok",
      kind: "custom",
      enabled: true,
      params: { processorId: "gain2x" },
    });
    const out = toolkit.effects.process(
      "trk-a",
      new Float32Array([0.2, 0.2]),
      48000,
    );
    expect(out[0]).toBeCloseTo(0.4, 5);
  });

  it("keeps reverb tail through offline render (no truncated queue)", () => {
    const toolkit = createMixProductionToolkit();
    toolkit.effects.insert("trk-a", {
      id: "rev",
      kind: "reverb",
      enabled: true,
      params: { mix: 0.6, roomSize: 0.9, damping: 0.2, width: 1 },
    });
    const sr = 48000;
    const left = new Float32Array(sr); // 1 s
    const right = new Float32Array(sr);
    left[0] = 0.9;
    right[0] = 0.9;
    const out = renderMixOffline({
      mixId: "mix-v001",
      sampleRate: sr,
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
      effects: toolkit.effects,
    });
    expect(out.path).toBe("production");
    expect(out.frameCount).toBeGreaterThan(sr);
    // Tail energy after the dry length.
    let tail = 0;
    for (let i = sr; i < out.frameCount; i++) {
      tail += out.left[i]! ** 2 + out.right[i]! ** 2;
    }
    expect(tail).toBeGreaterThan(1e-8);
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
