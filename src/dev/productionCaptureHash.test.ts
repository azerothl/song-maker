import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCaptureHash } from "./productionCaptureHash";

describe("parseCaptureHash", () => {
  it("résout pistes, densité et groupe replié", () => {
    assert.deepEqual(parseCaptureHash("6,auto,expanded"), {
      trackCount: 6,
      densityPreference: "auto",
      rythmiqueCollapsed: false,
      progressRatio: 0,
    });
    assert.deepEqual(parseCaptureHash("16,compact,collapsed"), {
      trackCount: 16,
      densityPreference: "compact",
      rythmiqueCollapsed: true,
      progressRatio: 0,
    });
    assert.deepEqual(parseCaptureHash("confortable"), {
      trackCount: 12,
      densityPreference: "confortable",
      rythmiqueCollapsed: false,
      progressRatio: 0,
    });
  });

  it("résout midplay pour les captures de contraste waveform", () => {
    assert.equal(parseCaptureHash("6,confortable,midplay").progressRatio, 0.45);
    assert.equal(parseCaptureHash("6,auto,progress=0.5").progressRatio, 0.5);
  });
});
