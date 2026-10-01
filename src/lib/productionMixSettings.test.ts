import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import fr from "../ui/fr.json";
import enProduction from "../ui/en.production.json";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import { formatGainDb } from "../screens/song/shared";
import { t } from "../ui/i18n";
import {
  formatMixGroupCollapsedSummary,
  formatMixGroupTrackCount,
} from "./mixGroupTrackCount";
import {
  assertProductionMixSettingsEnStrings,
  expectedClipsBarEnAccessibleNames,
  expectedMixSettingsPopoverEnAccessibleNames,
  productionMixSettingsUiEnKeys,
} from "./productionMixSettingsI18n";

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
});

describe("production mix settings i18n (#225)", () => {
  it("EN production keys resolve when locale is en (mutation: drop en.production.json merge)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(t("production.mixSettings"), "Mix settings");
    assert.equal(t("production.mixSettings.title"), "Mix settings");
    assert.equal(t("production.settings.snap"), "Snap");
  });

  it("EN gain uses period decimal separator (mutation: revert formatGainDb i18n)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.match(formatGainDb(1.5), /^\+1\.5 dB$/);
    assert.doesNotMatch(formatGainDb(1.5), /,/);
  });

  it("FR/EN parity for all production.* keys in fr.json", () => {
    const keys = Object.keys(fr).filter((k) => k.startsWith("production."));
    for (const key of keys) {
      assert.ok(key in enProduction, `missing EN for ${key}`);
    }
  });

  it("popover + Clips bar: every UI key has EN (mutation: drop en.production.json key)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assertProductionMixSettingsEnStrings(t, fr, productionMixSettingsUiEnKeys());
  });

  it("popover + Clips bar: accessible names fully in English", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const popoverNames = expectedMixSettingsPopoverEnAccessibleNames();
    for (const name of popoverNames) {
      assert.doesNotMatch(
        name,
        /[éèêëàùûîïœæ]/i,
        `popover name looks French: ${name}`,
      );
    }
    const clipsNames = expectedClipsBarEnAccessibleNames();
    assert.deepEqual(clipsNames, [
      t("production.settings.snap"),
      t("clips.gridMusical"),
      t("clips.gridTime"),
      t("clips.sub.quarter"),
      t("clips.sub.eighth"),
      t("clips.sub.sixteenth"),
      t("clips.sub.thirtysecond"),
      t("clips.zoom"),
    ]);
    assert.deepEqual(popoverNames, [
      t("production.mixSettings.close"),
      t("production.settings.snap"),
      t("clips.gridMusical"),
      t("clips.gridTime"),
      t("clips.sub.quarter"),
      t("clips.sub.eighth"),
      t("clips.sub.sixteenth"),
      t("clips.sub.thirtysecond"),
      t("clips.zoom"),
      t("mix.density.auto"),
      t("mix.density.compact"),
      t("mix.density.confortable"),
      t("production.settings.master"),
      t("separate.again"),
      t("mix.assist.drawer"),
    ]);
  });

  it("accessible names in English for mix settings popover (legacy smoke)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const names = expectedMixSettingsPopoverEnAccessibleNames();
    assert.ok(names.includes("Close"));
    assert.ok(names.includes("Snap"));
    assert.ok(names.includes("Mix assistant"));
    assert.ok(names.includes("Production copilot") === false);
  });
});

describe("mix group track count plural (#225)", () => {
  it("FR: track count labels and collapsed summary plural rules", () => {
    localStorage.setItem(LOCALE_KEY, "fr");
    assert.equal(formatMixGroupTrackCount(0), "0 pistes");
    assert.equal(formatMixGroupTrackCount(1), "1 piste");
    assert.match(formatMixGroupCollapsedSummary(0, "A"), /0 pistes masquées/);
    assert.match(formatMixGroupCollapsedSummary(1, "A"), /1 piste masquée/);
  });

  it("EN: 0 uses plural, 1 uses singular", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(formatMixGroupTrackCount(0), "0 tracks");
    assert.equal(formatMixGroupTrackCount(1), "1 track");
    assert.match(formatMixGroupCollapsedSummary(0, "A"), /0 tracks hidden/);
    assert.match(formatMixGroupCollapsedSummary(1, "A"), /1 track hidden/);
  });
});

describe("production forbidden copy (#225)", () => {
  it("production EN bundle strings avoid commercial forbidden words", () => {
    const texts = [
      ...Object.keys(fr)
        .filter((k) => k.startsWith("production."))
        .map((k) => String(fr[k as keyof typeof fr])),
      ...Object.values(enProduction),
    ];
    for (const text of texts) {
      assert.equal(
        COMMERCIAL_COPY_FORBIDDEN.test(text),
        false,
        `forbidden word in: ${text}`,
      );
    }
  });
});
