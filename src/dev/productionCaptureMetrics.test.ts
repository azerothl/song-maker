import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProductionCaptureChecks } from "./productionCaptureMetrics";

describe("buildProductionCaptureChecks", () => {
  it("valide listFits pour six pistes confortable", () => {
    const checks = buildProductionCaptureChecks({
      scrollHeight: 486,
      clientHeight: 486,
      knobMinVerticalMarginAllRows: 3.5,
      groupHeader: { heightPx: 24, msVisiblePx: [], msHitHeightPx: 24 },
    });
    assert.equal(checks.listFits, true);
    assert.equal(checks.knobMarginOk, true);
    assert.equal(checks.groupMsHitOk, true);
  });

  it("rejette un débordement de 2 px", () => {
    const checks = buildProductionCaptureChecks({
      scrollHeight: 488,
      clientHeight: 486,
      knobMinVerticalMarginAllRows: 3.5,
      groupHeader: { heightPx: 24, msVisiblePx: [], msHitHeightPx: 24 },
    });
    assert.equal(checks.listFits, false);
  });
});
