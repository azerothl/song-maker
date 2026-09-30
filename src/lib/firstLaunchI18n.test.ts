import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import fr from "../ui/fr.json";
import enProfiles from "../ui/en.profiles.json";
import { t } from "../ui/i18n.ts";
import { formatEtaFr } from "./firstLaunch.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

const FIRST_LAUNCH_KEYS = Object.keys(fr).filter((k) => k.startsWith("firstLaunch."));

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

describe("firstLaunch i18n (#202)", () => {
  it("FR and EN share the same firstLaunch key set", () => {
    const enKeys = Object.keys(enProfiles).filter((k) => k.startsWith("firstLaunch."));
    assert.deepEqual(enKeys.sort(), FIRST_LAUNCH_KEYS.sort());
  });

  it("forbidden marketing words absent from firstLaunch copy", () => {
    const texts = FIRST_LAUNCH_KEYS.flatMap((key) => [
      String(fr[key as keyof typeof fr]),
      String(enProfiles[key as keyof typeof enProfiles]),
    ]);
    for (const text of texts) {
      assert.equal(
        COMMERCIAL_COPY_FORBIDDEN.test(text),
        false,
        `forbidden word in: ${text}`,
      );
    }
  });

  it("English path resolves download counter lead", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(
      t("firstLaunch.download.leadSequential", { index: 3, total: 9 }),
      "Files download one after another · 3 of 9",
    );
    assert.equal(t("firstLaunch.status.failed"), "Failed");
    assert.equal(t("firstLaunch.retryFile"), "Retry");
  });

  it("English ETA and partial resume line contain no French (#220 Gabriel)", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const pending = formatEtaFr(null, true);
    assert.equal(pending, "Estimated once download speed is known");
    assert.doesNotMatch(pending, /Estimation|dès que|reçus|sur/i);
    const twelveSec = formatEtaFr(12, true);
    assert.match(twelveSec, /≈ 12 s \(estimate\)/);
    assert.doesNotMatch(twelveSec, /estimation/i);
    const resumeLine = t("firstLaunch.status.remainingAfterResume", {
      eta: formatEtaFr(85, true),
    });
    assert.doesNotMatch(resumeLine, /Estimation dès|après reprise|min \d+ s \(estimation\)/i);
    assert.match(resumeLine, /≈ .+\(estimate\)/);
    assert.doesNotMatch(resumeLine, / left after resume.*Estimation/i);
  });
});
