import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIDEBAR_COLLAPSED_KEY,
  effectiveSidebarCollapsed,
  readSidebarCollapsedPref,
  writeSidebarCollapsedPref,
} from "./sidebarCollapse";

describe("sidebarCollapse", () => {
  it("effectiveSidebarCollapsed forces collapse on narrow viewports", () => {
    assert.equal(effectiveSidebarCollapsed(false, true), true);
    assert.equal(effectiveSidebarCollapsed(true, true), true);
    assert.equal(effectiveSidebarCollapsed(false, false), false);
    assert.equal(effectiveSidebarCollapsed(true, false), true);
  });

  it("reads and writes the localStorage preference", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };

    assert.equal(readSidebarCollapsedPref(storage), false);
    writeSidebarCollapsedPref(true, storage);
    assert.equal(map.get(SIDEBAR_COLLAPSED_KEY), "1");
    assert.equal(readSidebarCollapsedPref(storage), true);
    writeSidebarCollapsedPref(false, storage);
    assert.equal(map.get(SIDEBAR_COLLAPSED_KEY), "0");
    assert.equal(readSidebarCollapsedPref(storage), false);
  });

  it("tolerates missing or broken storage", () => {
    assert.equal(readSidebarCollapsedPref(null), false);
    assert.doesNotThrow(() => writeSidebarCollapsedPref(true, null));
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    assert.equal(readSidebarCollapsedPref(broken), false);
    assert.doesNotThrow(() => writeSidebarCollapsedPref(false, broken));
  });
});
