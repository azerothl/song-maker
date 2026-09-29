import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contrastRatio,
  contrastRatioFromCssColors,
  SIDEBAR_HOVER_BG,
  SIDEBAR_HOVER_CONTRAST_RATIO,
  SIDEBAR_HOVER_TEXT,
} from "./sidebarContrast";

describe("sidebar hover contrast (maquette)", () => {
  it("documente le ratio texte / fond survol", () => {
    const ratio = contrastRatio(SIDEBAR_HOVER_TEXT, SIDEBAR_HOVER_BG);
    assert.equal(ratio, SIDEBAR_HOVER_CONTRAST_RATIO);
    assert.ok(ratio >= 4.5, `contraste AA attendu ≥ 4,5:1, mesuré ${ratio.toFixed(2)}:1`);
  });

  it("lit le même ratio depuis rgb() DOM typique", () => {
    const fromDom = contrastRatioFromCssColors("rgb(243, 240, 250)", "rgb(47, 42, 61)");
    assert.ok(fromDom != null);
    assert.ok(Math.abs(fromDom - SIDEBAR_HOVER_CONTRAST_RATIO) < 0.02);
  });
});
