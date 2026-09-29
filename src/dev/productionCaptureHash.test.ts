import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCaptureHash } from "./productionCaptureHash";

describe("parseCaptureHash", () => {
  it("résout pistes, densité et groupe replié", () => {
    assert.deepEqual(parseCaptureHash("6,auto,expanded"), {
      trackCount: 6,
      densityPreference: "auto",
      rythmiqueCollapsed: false,
      midPlayback: false,
    });
    assert.deepEqual(parseCaptureHash("16,compact,collapsed"), {
      trackCount: 16,
      densityPreference: "compact",
      rythmiqueCollapsed: true,
      midPlayback: false,
    });
    assert.deepEqual(parseCaptureHash("confortable"), {
      trackCount: 12,
      densityPreference: "confortable",
      rythmiqueCollapsed: false,
      midPlayback: false,
    });
    assert.equal(parseCaptureHash("16,auto,midplay").midPlayback, true);
  });
});
