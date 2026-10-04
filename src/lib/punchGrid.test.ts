import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  punchBarDurationMs,
  snapPunchMs,
  snapPunchWindow,
} from "./punchGrid";
import type { MixDoc } from "./types";

function mixAt(bpm: number, numerator = 4, denominator = 4): MixDoc {
  return {
    schema: "mix",
    schemaVersion: 1,
    id: "mix-test",
    separationId: "",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [],
    tempoMap: [{ startMs: 0, quarterBpm: bpm }],
    timeSignatures: [{ startMs: 0, numerator, denominator }],
    markers: [],
  };
}

describe("punchGrid", () => {
  it("uses one bar at mix tempo for default window", () => {
    assert.equal(punchBarDurationMs(mixAt(120)), 2000);
    assert.equal(punchBarDurationMs(mixAt(60)), 4000);
  });

  it("snaps punch-in to the musical grid", () => {
    const mix = mixAt(120);
    assert.equal(snapPunchMs(510, { mix, subdivision: 1 }), 500);
  });

  it("keeps punch-out after punch-in", () => {
    const mix = mixAt(120);
    const win = snapPunchWindow(0, 0, { mix, subdivision: 1 });
    assert.equal(win.punchInMs, 0);
    assert.equal(win.punchOutMs, 2000);
  });
});
