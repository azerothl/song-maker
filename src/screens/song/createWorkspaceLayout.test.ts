import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio } from "../../lib/firstLaunch.ts";
import {
  CREATE_LAYOUT_TWO_COLUMN_MIN_PX,
  CREATE_PANEL_MAX_WIDTH_REM,
  CREATE_PRIMARY_TAB_FIELD_ORDER,
  matchesGenerateShortcut,
} from "./createWorkspaceLayout.ts";

describe("createWorkspaceLayout", () => {
  it("fixe la largeur max. et le seuil deux colonnes (#131)", () => {
    assert.equal(CREATE_PANEL_MAX_WIDTH_REM, 75);
    assert.equal(CREATE_LAYOUT_TWO_COLUMN_MIN_PX, 901);
  });

  it("définit l’ordre de tabulation gauche puis droite", () => {
    assert.deepEqual(CREATE_PRIMARY_TAB_FIELD_ORDER, [
      "title",
      "style",
      "lyrics",
      "instrumentalMode",
      "advancedSettings",
      "generate",
    ]);
  });
});

describe("matchesGenerateShortcut", () => {
  it("accepte Ctrl+Entrée et ⌘+Entrée", () => {
    assert.equal(
      matchesGenerateShortcut({
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        key: "Enter",
      }),
      true,
    );
    assert.equal(
      matchesGenerateShortcut({
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
        key: "Enter",
      }),
      true,
    );
  });

  it("refuse Entrée seule (saisie des paroles)", () => {
    assert.equal(
      matchesGenerateShortcut({
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: "Enter",
      }),
      false,
    );
  });

  it("refuse Ctrl+Alt+Entrée", () => {
    assert.equal(
      matchesGenerateShortcut({
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        key: "Enter",
      }),
      false,
    );
  });
});

describe("createWorkspace contrast tokens (#131)", () => {
  it("respecte WCAG AA sur les paires documentées", () => {
    assert.ok(contrastRatio("#f3f0fa", "#221e2c") >= 4.5);
    assert.ok(contrastRatio("#bdb6cf", "#221e2c") >= 4.5);
    assert.ok(contrastRatio("#ffffff", "#805cdf") >= 4.5);
    assert.ok(contrastRatio("#7a6ea1", "#141218") >= 3);
  });
});
