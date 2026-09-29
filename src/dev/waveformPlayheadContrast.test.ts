import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contrastRatio,
  parseCssColor,
  WCAG_UI_CONTRAST_MIN,
  WAVE_PLAYHEAD_HALO,
  WAVE_PLAYHEAD_STROKE,
} from "./waveformPlayheadContrast";

describe("waveformPlayheadContrast", () => {
  it("calcule un ratio WCAG cohérent", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    assert.ok(contrastRatio(white, black) >= 20);
  });

  it("documente le trait du curseur", () => {
    assert.equal(parseCssColor(WAVE_PLAYHEAD_STROKE)?.a, 1);
    assert.ok(parseCssColor(WAVE_PLAYHEAD_HALO));
    assert.equal(WCAG_UI_CONTRAST_MIN, 3);
  });
});
