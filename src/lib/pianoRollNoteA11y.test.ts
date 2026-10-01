import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, before, describe, it } from "node:test";
import fr from "../ui/fr.json";
import enProfiles from "../ui/en.profiles.json";
import { t } from "../ui/i18n.ts";
import { midiPitchName } from "./midiPitchName.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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

describe("piano roll note a11y (#246)", () => {
  it("midiPitchName uses scientific pitch notation", () => {
    assert.equal(midiPitchName(60), "C4");
    assert.equal(midiPitchName(61), "C#4");
    assert.equal(midiPitchName(69), "A4");
  });

  it("FR and EN expose score.piano.noteAria with named variables", () => {
    assert.ok("score.piano.noteAria" in fr);
    assert.ok("score.piano.noteAria" in enProfiles);
    assert.match(fr["score.piano.noteAria"], /\{pitchName\}/);
    assert.match(fr["score.piano.noteAria"], /\{startTick\}/);
    assert.match(fr["score.piano.noteAria"], /\{durationTick\}/);
    assert.match(enProfiles["score.piano.noteAria"], /\{pitchName\}/);
    assert.match(enProfiles["score.piano.noteAria"], /\{startTick\}/);
    assert.match(enProfiles["score.piano.noteAria"], /\{durationTick\}/);
  });

  it("resolves accessible note names in FR and EN", () => {
    const vars = { pitchName: "C4", startTick: 480, durationTick: 240 };
    assert.equal(
      t("score.piano.noteAria", vars),
      "Note C4, départ 480, durée 240",
    );
    localStorage.setItem(LOCALE_KEY, "en");
    assert.equal(
      t("score.piano.noteAria", vars),
      "Note C4, start 480, duration 240",
    );
  });

  it("PianoRoll wires aria-label, aria-selected, Enter/Space, ≥44px", () => {
    const src = readFileSync(path.join(root, "src/components/PianoRoll.tsx"), "utf8");
    assert.match(src, /aria-label=\{t\("score\.piano\.noteAria"/);
    assert.match(src, /aria-selected=\{selected\}/);
    assert.match(src, /NOTE_HIT_PX = 44/);
    assert.match(src, /e\.key !== "Enter" && e\.key !== " "/);
    assert.match(src, /selectNote\(noteId, pitch\)/);
    const css = readFileSync(path.join(root, "src/App.css"), "utf8");
    assert.match(css, /\.piano-note\s*\{[^}]*min-width:\s*44px/s);
    assert.match(css, /\.piano-note\s*\{[^}]*min-height:\s*44px/s);
  });
});
