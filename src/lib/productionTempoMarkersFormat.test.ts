import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { formatMsForClipLabel } from "./productionTimeFormat.ts";
import { t } from "../ui/i18n.ts";

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

describe("tempo/markers remaining (#227)", () => {
  it("zones i18n : Tempo / Marqueurs (pas « voie »)", () => {
    assert.equal(t("production.lane.tempo"), "Tempo");
    assert.equal(t("production.lane.markers"), "Marqueurs");
    assert.doesNotMatch(t("production.lane.tempo"), /voie/i);
    assert.doesNotMatch(t("production.lane.markers"), /voie/i);
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(t("production.lane.tempo"), "Tempo");
    assert.equal(t("production.lane.markers"), "Markers");
  });

  it("FR virgule / EN point pour 12340 ms", () => {
    assert.equal(formatMsForClipLabel(12340), "0:12,3");
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(formatMsForClipLabel(12340), "0:12.3");
  });
});
