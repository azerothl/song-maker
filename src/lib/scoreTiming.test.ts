import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyScoreDocument, updateScoreTempo } from "./score.ts";
import {
  scoreSecondsToTicks,
  scoreTicksToSeconds,
  secondsToTicks,
  ticksToSeconds,
} from "./scoreTiming.ts";

describe("scoreTiming", () => {
  it("maps 960 ticks at 120 BPM to 0.5 s", () => {
    assert.equal(ticksToSeconds(960, 120), 0.5);
    assert.equal(secondsToTicks(0.5, 120), 960);
  });

  it("maps 960 ticks at 60 BPM to 1 s", () => {
    assert.equal(ticksToSeconds(960, 60), 1);
    assert.equal(secondsToTicks(1, 60), 960);
  });

  it("uses document tempo map", () => {
    let doc = createEmptyScoreDocument();
    doc = updateScoreTempo(doc, 90);
    // 960 ticks = 1 quarter → 60/90 s
    assert.ok(Math.abs(scoreTicksToSeconds(doc, 960) - 60 / 90) < 1e-9);
    assert.equal(scoreSecondsToTicks(doc, 60 / 90), 960);
  });

  it("guards non-positive inputs", () => {
    assert.equal(ticksToSeconds(0, 120), 0);
    assert.equal(ticksToSeconds(-10, 120), 0);
    assert.equal(secondsToTicks(0, 120), 0);
  });
});
