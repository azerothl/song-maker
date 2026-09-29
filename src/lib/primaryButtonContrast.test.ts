import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  measurePrimaryButtonFromDom,
  PRIMARY_BUTTON_GRADIENT_BOTTOM,
  PRIMARY_BUTTON_GRADIENT_TOP,
  PRIMARY_BUTTON_TEXT,
  PRIMARY_BUTTON_WORST_GRADIENT_CONTRAST,
  WCAG_AA_TEXT_MIN,
} from "./primaryButtonContrast";
import { contrastRatio } from "./sidebarContrast";

describe("bouton primaire — tokens (#186)", () => {
  it("documente le pire ratio texte sombre / stop clair du dégradé (calculé)", () => {
    const top = contrastRatio(PRIMARY_BUTTON_TEXT, PRIMARY_BUTTON_GRADIENT_TOP);
    const bottom = contrastRatio(PRIMARY_BUTTON_TEXT, PRIMARY_BUTTON_GRADIENT_BOTTOM);
    assert.equal(PRIMARY_BUTTON_WORST_GRADIENT_CONTRAST, top);
    assert.ok(top >= WCAG_AA_TEXT_MIN, `haut ${top.toFixed(2)}:1`);
    assert.ok(bottom >= WCAG_AA_TEXT_MIN, `bas ${bottom.toFixed(2)}:1`);
  });

  it("mesure le contraste depuis rgb() et stops de dégradé calculés (DOM simulé)", () => {
    const prev = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () =>
      ({
        color: "rgb(21, 24, 39)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        backgroundImage: "linear-gradient(rgb(196, 168, 255), rgb(167, 139, 250))",
      }) as CSSStyleDeclaration;
    try {
      const m = measurePrimaryButtonFromDom({} as Element, "normal");
      assert.equal(m.foregroundCss, "rgb(21, 24, 39)");
      assert.equal(m.foregroundHex, "#151827");
      assert.ok(m.backgroundStopsCss.length >= 2);
      assert.ok(m.worstStopContrast != null && m.worstStopContrast >= WCAG_AA_TEXT_MIN);
      assert.equal(m.passAa, true);
    } finally {
      globalThis.getComputedStyle = prev;
    }
  });

  it("documente le texte désactivé #848ba0 ~4,7:1 (distinct du secondaire, #193)", () => {
    const ratio = contrastRatio("#848ba0", "#1c2034");
    assert.ok(
      ratio >= 3,
      `attendu ≥ 3:1 (lisibilité désactivé), obtenu ${ratio.toFixed(2)}:1`,
    );
    assert.ok(
      ratio >= 4.5 && ratio < 5.5,
      `cible ~4,7:1, obtenu ${ratio.toFixed(2)}:1`,
    );
  });
});
