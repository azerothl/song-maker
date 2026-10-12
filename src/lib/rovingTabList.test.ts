import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { nextRovingTabIndex } from "./rovingTabList";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("roving tab keyboard navigation", () => {
  it("wraps horizontal arrows and supports Home and End", () => {
    assert.equal(nextRovingTabIndex("ArrowRight", 0, 3), 1);
    assert.equal(nextRovingTabIndex("ArrowLeft", 0, 3), 2);
    assert.equal(nextRovingTabIndex("Home", 2, 3), 0);
    assert.equal(nextRovingTabIndex("End", 0, 3), 2);
  });

  it("uses vertical arrows only for vertical tab lists", () => {
    assert.equal(nextRovingTabIndex("ArrowDown", 1, 3, "vertical"), 2);
    assert.equal(nextRovingTabIndex("ArrowUp", 0, 3, "vertical"), 2);
    assert.equal(nextRovingTabIndex("ArrowDown", 1, 3), null);
    assert.equal(nextRovingTabIndex("ArrowRight", 1, 3, "vertical"), null);
  });

  it("ignores unrelated keys and invalid list positions", () => {
    assert.equal(nextRovingTabIndex("Enter", 1, 3), null);
    assert.equal(nextRovingTabIndex("ArrowRight", -1, 3), null);
    assert.equal(nextRovingTabIndex("ArrowRight", 0, 0), null);
  });

  it("wires keyboard navigation to every shipped tab list in the production flows", () => {
    for (const relativePath of [
      "src/screens/SongScreen.tsx",
      "src/screens/song/ScoreWorkspace.tsx",
      "src/components/ScorePanel.tsx",
      "src/components/production/ProductionTrackTools.tsx",
    ]) {
      const source = readFileSync(join(root, relativePath), "utf8");
      assert.match(
        source,
        /role="tablist"[\s\S]{0,220}onKeyDown=\{handleRovingTabListKeyDown\}/,
        relativePath,
      );
    }
  });
});
