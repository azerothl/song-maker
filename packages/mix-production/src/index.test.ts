import { describe, expect, it } from "vitest";
import { createStubMixProductionToolkit } from "./index.js";

describe("mix-production stubs", () => {
  it("stores automation lanes without sampling DSP", () => {
    const toolkit = createStubMixProductionToolkit();
    toolkit.automation.setLane("mix-v001", {
      trackId: "trk-vocals",
      target: "volume",
      points: [
        { timeMs: 0, value: 0 },
        { timeMs: 1000, value: -3 },
      ],
    });
    expect(toolkit.automation.listLanes("mix-v001")).toHaveLength(1);
    expect(() =>
      toolkit.automation.sampleAt("mix-v001", "trk-vocals", "volume", 500),
    ).toThrow(/phase-3 stub/i);
  });

  it("tracks effect slots and refuses process()", () => {
    const toolkit = createStubMixProductionToolkit();
    toolkit.effects.insert("trk-drums", {
      id: "fx-1",
      kind: "compressor",
      enabled: true,
      params: { ratio: 4 },
    });
    expect(toolkit.effects.list("trk-drums")[0]?.kind).toBe("compressor");
    expect(() => toolkit.effects.process("trk-drums", new Float32Array(4))).toThrow(
      /No DSP/,
    );
  });

  it("upserts sidechain routes and returns null loudness for standard none", async () => {
    const toolkit = createStubMixProductionToolkit();
    toolkit.sidechain.upsert("mix-v001", {
      id: "sc-1",
      sourceTrackId: "trk-drums",
      destinationTrackId: "trk-bass",
      thresholdDb: -24,
      ratio: 4,
      enabled: true,
    });
    expect(toolkit.sidechain.listRoutes("mix-v001")).toHaveLength(1);
    const report = await toolkit.loudness.measure("/tmp/mix.wav", "none");
    expect(report.integratedLufs).toBeNull();
  });
});
