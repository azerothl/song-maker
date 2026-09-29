import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blendPxPerBar,
  computeStaffScrollWindow,
  playbackBarIndex,
} from "./staffWindow.ts";

describe("computeStaffScrollWindow", () => {
  it("borne le nombre de mesures rendues", () => {
    const w = computeStaffScrollWindow({
      scrollTop: 0,
      viewportHeight: 400,
      barCount: 500,
      pxPerBar: 50,
    });
    assert.equal(w.renderStart, 0);
    assert.ok(w.renderCount <= 56);
    assert.ok(w.renderCount >= 20);
  });

  it("décale renderStart au scroll", () => {
    const w = computeStaffScrollWindow({
      scrollTop: 5000,
      viewportHeight: 400,
      barCount: 500,
      pxPerBar: 50,
    });
    assert.ok(w.renderStart > 80);
    assert.ok(w.renderStart + w.renderCount <= 500);
  });

  it("couvre tout un morceau court", () => {
    const w = computeStaffScrollWindow({
      scrollTop: 0,
      viewportHeight: 400,
      barCount: 30,
      pxPerBar: 50,
    });
    assert.equal(w.renderStart, 0);
    assert.equal(w.renderCount, 30);
  });
});

describe("playbackBarIndex", () => {
  it("convertit les secondes en index de mesure", () => {
    assert.equal(playbackBarIndex(0, 2), 0);
    assert.equal(playbackBarIndex(3.9, 2), 1);
    assert.equal(playbackBarIndex(4, 2), 2);
  });
});

describe("blendPxPerBar", () => {
  it("converge vers la mesure sans sauter", () => {
    const next = blendPxPerBar(50, 60, 24);
    assert.ok(next > 50 && next < 60);
  });
});
