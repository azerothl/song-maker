import { describe, expect, it } from "vitest";
import {
  applyStemBalanceProposals,
  estimateBusTruePeakDb,
  loudnessMatchGainDb,
  measurePlanarStemLevel,
  proposeStemBalance,
} from "./autoBalance.js";

function tone(
  frames: number,
  amp: number,
  freq = 440,
  sr = 48000,
): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sr) * amp;
  }
  return out;
}

describe("automatic stem balance", () => {
  it("measures RMS and peak; marks silence", () => {
    const hot = measurePlanarStemLevel(
      "a",
      "vocals",
      tone(4000, 0.5),
      tone(4000, 0.5),
    );
    expect(hot.silent).toBe(false);
    expect(hot.peakDb).toBeGreaterThan(-10);
    expect(hot.rmsDb).toBeGreaterThan(-20);

    const quiet = measurePlanarStemLevel(
      "b",
      "drums",
      new Float32Array(1000),
      new Float32Array(1000),
    );
    expect(quiet.silent).toBe(true);
    expect(quiet.peakDb).toBeLessThanOrEqual(-60);
  });

  it("proposes bounded role gains and skips custom / silent / missing", () => {
    const vocals = tone(8000, 0.15);
    const drums = tone(8000, 0.4);
    const silent = new Float32Array(8000);
    const stems = [
      { trackId: "trk-vocals", left: vocals, right: vocals },
      { trackId: "trk-drums", left: drums, right: drums },
      { trackId: "trk-bass", left: silent, right: silent },
      { trackId: "trk-user", left: tone(8000, 0.2), right: tone(8000, 0.2) },
    ];
    const tracks = [
      { id: "trk-vocals", role: "vocals", gainDb: 0 },
      { id: "trk-drums", role: "drums", gainDb: 0 },
      { id: "trk-bass", role: "bass", gainDb: 0 },
      { id: "trk-user", role: "user", gainDb: -2 },
    ];
    const measurements = tracks.map((tr) => {
      const s = stems.find((x) => x.trackId === tr.id)!;
      return measurePlanarStemLevel(tr.id, tr.role, s.left, s.right);
    });

    const result = proposeStemBalance({ tracks, measurements, stems });
    const byId = Object.fromEntries(result.proposals.map((p) => [p.trackId, p]));

    expect(byId["trk-user"]!.note).toBe("custom");
    expect(byId["trk-user"]!.proposedGainDb).toBe(-2);
    expect(byId["trk-bass"]!.note).toBe("silent");
    expect(byId["trk-vocals"]!.proposedGainDb).toBeGreaterThanOrEqual(-12);
    expect(byId["trk-vocals"]!.proposedGainDb).toBeLessThanOrEqual(6);
    expect(byId["trk-drums"]!.proposedGainDb).toBeGreaterThanOrEqual(-12);
    expect(byId["trk-drums"]!.proposedGainDb).toBeLessThanOrEqual(6);
    expect(result.estimatedBusPeakDb).toBeLessThanOrEqual(-0.5);
  });

  it("estimates bus peak and applies proposals without touching clips", () => {
    const left = tone(2000, 0.8);
    const stems = [{ trackId: "trk-other", left, right: left }];
    const peak = estimateBusTruePeakDb(stems, { "trk-other": 0 });
    expect(peak).toBeGreaterThan(-6);

    const mix = {
      tracks: [
        {
          id: "trk-other",
          role: "other",
          gainDb: 0,
          clips: [{ id: "keep" }],
        },
      ],
    };
    const next = applyStemBalanceProposals(mix, [
      {
        trackId: "trk-other",
        role: "other",
        currentGainDb: 0,
        proposedGainDb: -3,
        deltaDb: -3,
        measured: measurePlanarStemLevel("trk-other", "other", left, left),
        note: "balanced",
      },
    ]);
    expect(next.tracks[0]!.gainDb).toBe(-3);
    expect(next.tracks[0]!.clips).toEqual([{ id: "keep" }]);
  });

  it("computes a bounded loudness-match gain for A/B", () => {
    expect(loudnessMatchGainDb(-18, -24)).toBe(6);
    expect(loudnessMatchGainDb(-18, -40)).toBe(12);
    expect(loudnessMatchGainDb(-18, -80)).toBe(0);
  });
});
