import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "../ui/i18n";

/** Cibles issues #157 — bouton lecture compact, libellés accessibles. */
describe("production transport master (#157)", () => {
  it("expose des aria-label lecture / pause / chargement en français", () => {
    assert.equal(t("player.play"), "Lecture");
    assert.equal(t("player.pause"), "Pause");
    assert.equal(t("player.loading"), "Chargement de la lecture");
  });
});
