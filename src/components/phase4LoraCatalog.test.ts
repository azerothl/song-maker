import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Phase4SettingsPanel } from "./Phase4SettingsPanel";
import { setAppLocale } from "../ui/i18n";

it("explains unavailable LoRA packs in French and English without offering broken downloads", () => {
  let storedLocale = "fr";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => storedLocale,
      setItem: (_key: string, value: string) => { storedLocale = value; },
    },
  });
  for (const [locale, notReady, realAudio, chanson] of [
    ["fr", "Installation indisponible dans Song Maker", "Améliore le rendu des voix", "Styles de chanson française"],
    ["en", "Not available to install in Song Maker", "Improves vocal rendering", "French chanson styles"],
  ] as const) {
    setAppLocale(locale);
    const html = renderToStaticMarkup(createElement(Phase4SettingsPanel, { view: "lora" }));
    assert.equal((html.match(new RegExp(notReady, "g")) ?? []).length, 3);
    assert.ok(html.includes(realAudio));
    assert.ok(html.includes(chanson));
    assert.equal((html.match(/Installer le pack|Install pack/g) ?? []).length, 1);
    assert.ok(!html.includes("chnsn_cabaret.safetensors"));
    assert.ok(html.includes("aucun téléchargement n’est proposé") || html.includes("no download is offered"));
  }
  setAppLocale("fr");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
});
