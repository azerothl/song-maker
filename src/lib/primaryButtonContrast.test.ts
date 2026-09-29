import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  measurePrimaryButtonFromDom,
  WCAG_AA_TEXT_MIN,
} from "./primaryButtonContrast";
import { contrastRatio } from "./sidebarContrast";

describe("bouton primaire — états interactifs (#186)", () => {
  it("mesure le contraste depuis rgb() DOM simulé (normal)", () => {
    const prev = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () =>
      ({
        color: "rgb(21, 24, 39)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        backgroundImage: "linear-gradient(rgb(196, 168, 255), rgb(167, 139, 250))",
      }) as CSSStyleDeclaration;
    try {
      const m = measurePrimaryButtonFromDom({} as Element, "normal");
      assert.ok((m.effectiveContrast ?? 0) >= WCAG_AA_TEXT_MIN);
      assert.equal(m.passAa, true);
    } finally {
      globalThis.getComputedStyle = prev;
    }
  });

  it("documente un contraste AA pour texte muted sur fond éteint (calculé)", () => {
    const ratio = contrastRatio("#a7aec4", "#181b28");
    assert.ok(ratio >= WCAG_AA_TEXT_MIN, `attendu ≥ 4,5:1, obtenu ${ratio.toFixed(2)}:1`);
  });
});
