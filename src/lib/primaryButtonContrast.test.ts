import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  measurePrimaryButtonFromDom,
  PRIMARY_BUTTON_DISABLED_BG,
  PRIMARY_BUTTON_DISABLED_TEXT,
  PRIMARY_BUTTON_DISABLED_TEXT_RATIO_ON_FACE,
  PRIMARY_BUTTON_FOCUS_INSET_MIN_CONTRAST_ON_FACE,
  PRIMARY_BUTTON_FOCUS_INSET_SEP,
  PRIMARY_BUTTON_FOCUS_RING,
  PRIMARY_BUTTON_GRADIENT_BOTTOM,
  PRIMARY_BUTTON_GRADIENT_TOP,
  PRIMARY_BUTTON_TEXT,
  PRIMARY_BUTTON_WORST_GRADIENT_CONTRAST,
  WCAG_AA_TEXT_MIN,
} from "./primaryButtonContrast";
import { contrastRatio } from "./sidebarContrast";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

  it("documente le texte désactivé #848ba0 ≥ 5,3:1 sur #12151f (natif et aria-disabled)", () => {
    assert.equal(PRIMARY_BUTTON_DISABLED_BG, "#12151f");
    const ratio = contrastRatio(PRIMARY_BUTTON_DISABLED_TEXT, PRIMARY_BUTTON_DISABLED_BG);
    assert.equal(ratio, PRIMARY_BUTTON_DISABLED_TEXT_RATIO_ON_FACE);
    assert.ok(
      ratio >= 5.3,
      `attendu ≥ 5,3:1 sur face I2, obtenu ${ratio.toFixed(2)}:1`,
    );
    assert.ok(ratio >= WCAG_AA_TEXT_MIN);
  });

  it("I3 : anneau deux tons (cyan / liseré #151827 / face lavande) ≥ 3:1", () => {
    const cyanVsSep = contrastRatio(
      PRIMARY_BUTTON_FOCUS_RING,
      PRIMARY_BUTTON_FOCUS_INSET_SEP,
    );
    const sepVsTop = contrastRatio(
      PRIMARY_BUTTON_FOCUS_INSET_SEP,
      PRIMARY_BUTTON_GRADIENT_TOP,
    );
    const sepVsBottom = contrastRatio(
      PRIMARY_BUTTON_FOCUS_INSET_SEP,
      PRIMARY_BUTTON_GRADIENT_BOTTOM,
    );
    assert.ok(
      cyanVsSep >= PRIMARY_BUTTON_FOCUS_INSET_MIN_CONTRAST_ON_FACE,
      `cyan vs liseré ${cyanVsSep.toFixed(2)}:1`,
    );
    assert.ok(
      Math.min(sepVsTop, sepVsBottom) >=
        PRIMARY_BUTTON_FOCUS_INSET_MIN_CONTRAST_ON_FACE,
      `liseré vs face lavande`,
    );
  });

  it("I3 : outline-offset -2px et box-shadow inset sur la barre mix (CSS)", () => {
    const css = readFileSync(path.join(ROOT, "App.css"), "utf8");
    const block = css.match(
      /\.production-mix-toolbar-actions > \.btn\.primary:focus-visible(?:,\s*\.production-main-toolbar-actions > \.btn\.primary:focus-visible)?\s*\{[^}]+\}/,
    );
    assert.ok(block, "règle barre mix I3 introuvable");
    assert.match(block![0], /outline-offset:\s*-2px/);
    assert.match(css, /\.production-main-toolbar-actions > \.btn\.primary:focus-visible/);
    assert.match(block![0], /box-shadow:\s*inset 0 0 0 2px #151827/);
    assert.doesNotMatch(
      css,
      /\.anchored-popin-footer \.btn:focus-visible/,
      "pied de popin retiré (R-2 : aucun rognage démontré)",
    );
  });

  it("I2 : désactivé primaire tirets #6a7394 et face #12151f (natif + aria-disabled)", () => {
    const css = readFileSync(path.join(ROOT, "App.css"), "utf8");
    const block = css.match(
      /\.btn\.primary:disabled,\s*\n\.btn\.primary\[aria-disabled="true"\]\s*\{[^}]+\}/,
    );
    assert.ok(block, "règle désactivé primaire introuvable");
    assert.match(block![0], /#12151f/);
    assert.match(block![0], /border-style:\s*dashed/);
    assert.match(block![0], /#6a7394/);
    assert.match(block![0], /opacity:\s*1 !important/);
  });
});
