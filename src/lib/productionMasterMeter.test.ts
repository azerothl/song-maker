import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mixPeakAtPlayhead, mixPeakPercent } from "./productionMasterMeter.ts";

describe("production master meter (#345)", () => {
  it("maps playhead to the matching peak bucket", () => {
    const peaks = new Float32Array([0.1, 0.8, 0.2]);
    assert.ok(Math.abs(mixPeakAtPlayhead(peaks, 0, 3) - 0.1) < 1e-6);
    assert.ok(Math.abs(mixPeakAtPlayhead(peaks, 1.5, 3) - 0.8) < 1e-6);
    assert.ok(Math.abs(mixPeakAtPlayhead(peaks, 2.9, 3) - 0.2) < 1e-6);
    assert.equal(mixPeakPercent(0.8), 80);
  });

  it("returns 0 without peaks or duration", () => {
    assert.equal(mixPeakAtPlayhead(null, 1, 3), 0);
    assert.equal(mixPeakAtPlayhead(new Float32Array([1]), 1, 0), 0);
  });
});
