import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, describe, it } from "node:test";
import { t } from "../ui/i18n.ts";
import { isMixMsActivationKey } from "./productionMixA11y.ts";
import { formatMsForClipLabel } from "./productionTimeFormat.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

const PRODUCTION_KEYS = [
  "production.track.tools",
  "production.track.popover",
  "production.track.fades",
  "production.track.clipNone",
  "production.track.clipSel",
  "production.track.muteSolo",
  "production.track.mute",
  "production.track.solo",
  "production.track.moreEq",
  "production.track.showAuto",
  "production.track.close",
  "production.eq.popover",
  "production.eq.popover.close",
  "production.addTrack",
  "production.addTrack.menu",
  "production.addTrack.empty",
  "production.track.tabs",
  "production.track.tab.eq",
  "production.track.tab.fx",
  "production.track.tab.automation",
  "production.track.tab.settings",
  "production.fx.line.title",
  "production.strip.invalid",
] as const;

before(() => {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
});

afterEach(() => {
  store.delete(LOCALE_KEY);
});

describe("Production #226 — i18n et structure", () => {
  it("clés production.* FR qualifiées et EN présentes", () => {
    for (const key of PRODUCTION_KEYS) {
      const fr = t(key, { track: "Voix", effect: "Limiteur", n: 1, time: "0:12,3" });
      assert.ok(fr.length > 0 && fr !== key, key);
      localStorage.setItem(LOCALE_KEY, "en");
      const en = t(key, { track: "Vocals", effect: "Limiter", n: 1, time: "0:12.3" });
      assert.ok(en.length > 0 && en !== key, `${key} en`);
      assert.doesNotMatch(en, /Réglages de la piste/);
      localStorage.removeItem(LOCALE_KEY);
    }
  });

  it("formatMsForClipLabel respecte la locale décimale", () => {
    assert.match(formatMsForClipLabel(12300), /12,3/);
    localStorage.setItem(LOCALE_KEY, "en");
    assert.match(formatMsForClipLabel(12300), /12\.3/);
  });

  it("ProductionWorkspace sans tiroir production-actions-drawer", () => {
    const src = readFileSync("src/screens/song/ProductionWorkspace.tsx", "utf8");
    assert.doesNotMatch(src, /production-actions-drawer/);
    assert.match(src, /ProductionAddTrackMenu/);
    assert.match(src, /ProductionTrackTools/);
  });

  it("mutation : isMixMsActivationKey faux pour Tab", () => {
    assert.equal(isMixMsActivationKey("Tab"), false);
  });
});
