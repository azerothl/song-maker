import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import enProduction from "../ui/en.production.json";
import fr from "../ui/fr.json";
import { t } from "../ui/i18n.ts";
import { formatProductionDb, formatProductionDecimal } from "./productionFormat.ts";
import { clipFadeErrorMessage } from "./clipFadeErrorMessage.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

/** Clés affichées par les nouveaux composants #226 — doivent exister dans en.production.json. */
const EN_PRODUCTION_REQUIRED = Object.keys(enProduction) as Array<
  keyof typeof enProduction
>;

const FRENCH_MARKERS = /Importer une|Fondu d|Limiteur|Bande |Réglages|Aucun effet|fondus|Valeur invalide/i;

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

describe("PR #243 i18n EN (Gabriel B1–B4)", () => {
  it("chaque clé de en.production.json est définie et distincte du FR (pas de repli silencieux)", () => {
    assert.ok(EN_PRODUCTION_REQUIRED.includes("mix.columns.tools"));
    assert.equal(enProduction["mix.columns.tools"], "Settings");
    for (const key of EN_PRODUCTION_REQUIRED) {
      const enVal = enProduction[key];
      assert.ok(typeof enVal === "string" && enVal.length > 0, key);
      const frVal = fr[key as keyof typeof fr];
      if (typeof frVal === "string" && frVal !== enVal) {
        assert.notEqual(enVal, frVal, key);
      }
      assert.doesNotMatch(enVal, FRENCH_MARKERS, `${key} ressemble au FR`);
    }
  });

  it("t() en anglais pour effet et menu ne retombe pas sur le français", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(t("mix.columns.tools"), "Settings");
    assert.equal(t("mix.importAudio"), "Import audio track");
    assert.equal(t("phase3.mix.fx.limiter"), "Limiter");
    assert.equal(
      t("production.fx.removeNamed", { effect: "Limiter" }),
      "Remove: Limiter",
    );
    assert.equal(t("production.eq.bandNamed", { n: 2 }), "Band 2");
  });

  it("formatProductionDecimal et formatProductionDb respectent la locale", () => {
    assert.equal(formatProductionDecimal(3.5, 1), "3,5");
    assert.equal(formatProductionDb(-3), "−3,0 dB");
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(formatProductionDecimal(3.5, 1), "3.5");
    assert.match(formatProductionDb(-3), /[−-]3\.0 dB/);
  });

  it("clipFadeErrorMessage n’expose pas le message brut score-engine", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const msg = clipFadeErrorMessage(
      new Error("fondus trop longs pour la durée du clip (clip-abc)"),
    );
    assert.equal(msg, t("production.fade.error.tooLong"));
    assert.doesNotMatch(msg, /clip-abc/);
  });
});
