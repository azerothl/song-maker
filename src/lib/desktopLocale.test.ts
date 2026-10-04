import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import fr from "../ui/fr.json";
import { englishCatalog, setAppLocale, t } from "../ui/i18n.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

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
  setAppLocale("fr");
});

describe("desktop bilingual UI (#331)", () => {
  it("every French key has a non-empty English catalog entry", () => {
    const en = englishCatalog();
    const missing: string[] = [];
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      if (!(key in en) || en[key] === undefined) missing.push(key);
    }
    assert.deepEqual(missing, []);
  });

  it("product screens do not fall back to French under EN", () => {
    setAppLocale("en");
    const leftovers: string[] = [];
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      if (key === "settings.language.fr") continue;
      const frVal = fr[key];
      const enVal = t(key);
      if (frVal !== enVal) continue;
      if (/[àâçéèêëîïôùûüœ]/i.test(frVal)) leftovers.push(`${key}=${enVal}`);
    }
    assert.deepEqual(leftovers, []);
  });

  it("setAppLocale persists and switches Create / Settings strings", () => {
    setAppLocale("en");
    assert.equal(localStorage.getItem(LOCALE_KEY), "en");
    assert.equal(t("workspace.create"), "Create");
    assert.equal(t("settings.title"), "Settings");
    assert.equal(t("form.title"), "Song name");
    assert.equal(t("generate.button"), "Generate");
    setAppLocale("fr");
    assert.equal(t("workspace.create"), "Créer");
    assert.equal(t("settings.title"), "Paramètres");
  });
});
