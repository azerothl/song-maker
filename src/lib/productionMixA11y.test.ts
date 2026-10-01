import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "../ui/i18n";
import { isMixMsActivationKey } from "./productionMixA11y";

describe("production mix M/S accessibilité", () => {
  it("utilise des aria-label explicites en français", () => {
    assert.equal(t("mix.muteNamed", { track: "Chœurs" }), "Muet : Chœurs");
    assert.equal(t("mix.soloNamed", { track: "Voix lead" }), "Solo : Voix lead");
  });

  it("documente Tab pour le focus et Entrée/Espace pour activer (boutons natifs)", () => {
    assert.equal(isMixMsActivationKey("Tab"), false);
    assert.equal(isMixMsActivationKey("Enter"), true);
    assert.equal(isMixMsActivationKey(" "), true);
  });
});
