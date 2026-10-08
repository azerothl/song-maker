import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Phase4SettingsPanel } from "./Phase4SettingsPanel";
import { setAppLocale } from "../ui/i18n";

it("uses clear, localized names for LoRA packs and custom imports", () => {
  let storedLocale = "fr";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => storedLocale,
      setItem: (_key: string, value: string) => { storedLocale = value; },
    },
  });
  for (const [locale, instrumentalName, importHint] of [
    ["fr", "Style instrumental YuE2", "Vous avez téléchargé un style YuE2 ailleurs ?"],
    ["en", "YuE2 instrumental style", "Downloaded a YuE2 style elsewhere?"],
  ] as const) {
    setAppLocale(locale);
    const html = renderToStaticMarkup(createElement(Phase4SettingsPanel, { view: "lora" }));
    assert.ok(html.includes(instrumentalName));
    assert.ok(html.includes(importHint));
    assert.ok(!html.includes("YuE2 instrumental CoT (AR)"));
  }
  setAppLocale("fr");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
});
