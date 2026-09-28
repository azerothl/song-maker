import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLatencyReading,
  latencyHintForPreference,
  readCaptureLatency,
} from "./captureLatency.ts";
import {
  isAudibleTake,
  listTakesInGroup,
  selectActiveTake,
} from "./takes.ts";

describe("captureLatency", () => {
  it("maps preferences to AudioContext latencyHint", () => {
    assert.equal(latencyHintForPreference("low"), "interactive");
    assert.equal(latencyHintForPreference("stable"), "playback");
    assert.equal(latencyHintForPreference("balanced"), "balanced");
  });

  it("reads nulls without a context", () => {
    const r = readCaptureLatency(null, "balanced");
    assert.equal(r.roundTripMs, null);
    assert.equal(formatLatencyReading(r), "—");
  });
});

describe("takes", () => {
  it("selects one active take in a group", () => {
    const clips = [
      { id: "a", takeGroupId: "g1", takeIndex: 0, takeActive: true },
      { id: "b", takeGroupId: "g1", takeIndex: 1, takeActive: false },
      { id: "c", takeGroupId: "other", takeActive: true },
    ];
    const next = selectActiveTake(clips, "g1", "b");
    assert.equal(next[0]!.takeActive, false);
    assert.equal(next[1]!.takeActive, true);
    assert.equal(next[2]!.takeActive, true);
    assert.equal(listTakesInGroup(next, "g1").length, 2);
    assert.equal(isAudibleTake(next[1]!), true);
    assert.equal(isAudibleTake(next[0]!), false);
  });
});
