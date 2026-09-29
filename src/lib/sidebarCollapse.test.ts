import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySidebarToggle,
  clearNarrowOverrideOnWideViewport,
  computeSidebarCollapsed,
  SIDEBAR_COLLAPSED_KEY,
  readSidebarCollapsedPref,
  writeSidebarCollapsedPref,
} from "./sidebarCollapse";

describe("computeSidebarCollapsed", () => {
  it("repli automatique en fenêtre étroite sauf override", () => {
    assert.equal(computeSidebarCollapsed(false, true, false), true);
    assert.equal(computeSidebarCollapsed(false, true, true), false);
    assert.equal(computeSidebarCollapsed(true, false, false), true);
    assert.equal(computeSidebarCollapsed(false, false, false), false);
  });
});

describe("applySidebarToggle", () => {
  it("bascule narrowOverride en fenêtre étroite sans écraser la préférence large", () => {
    assert.deepEqual(applySidebarToggle(false, true, false), {
      userCollapsed: false,
      narrowOverride: true,
    });
    assert.deepEqual(applySidebarToggle(false, true, true), {
      userCollapsed: false,
      narrowOverride: false,
    });
  });

  it("bascule la préférence mémorisée en fenêtre large", () => {
    assert.deepEqual(applySidebarToggle(false, false, false), {
      userCollapsed: true,
      narrowOverride: false,
    });
  });
});

describe("clearNarrowOverrideOnWideViewport", () => {
  it("réinitialise l’override quand la fenêtre redevient large", () => {
    assert.equal(clearNarrowOverrideOnWideViewport(false, true), false);
    assert.equal(clearNarrowOverrideOnWideViewport(true, true), true);
  });
});

describe("sidebarCollapse storage", () => {
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
