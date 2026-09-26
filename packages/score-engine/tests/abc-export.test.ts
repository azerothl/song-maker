import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  abcPitchToMidi,
  buildTonightAwakeFixture,
  exportToYuE2Abc,
  midiToAbcPitch,
  normalizeAbc,
  validateForAbcExport,
} from "../src/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const fixtures = join(root, "fixtures");

function loadFixture(name: string): string {
  return normalizeAbc(readFileSync(join(fixtures, name), "utf8"));
}

describe("export ABC vs YuE fixtures", () => {
  it("melody: cot=melody, zéro symbole d’accord, match melody.abc", () => {
    const doc = buildTonightAwakeFixture({ withChords: false });
    const result = exportToYuE2Abc(doc, { cot: "melody" });
    assert.equal(result.abc.includes('"C"'), false);
    assert.equal(/\n"[A-G]/.test(result.abc), false);
    assert.equal(normalizeAbc(result.abc), loadFixture("melody.abc"));
  });

  it("score: cot=full, match score.abc", () => {
    const doc = buildTonightAwakeFixture({ withChords: true });
    const result = exportToYuE2Abc(doc, { cot: "full" });
    assert.match(result.abc, /"C"/);
    assert.equal(normalizeAbc(result.abc), loadFixture("score.abc"));
  });

  it("jazz: hauteurs et tempo matchent score.abc ; accords peuvent différer", () => {
    const jazzDoc = buildTonightAwakeFixture({
      withChords: true,
      jazzChords: true,
    });
    const scoreDoc = buildTonightAwakeFixture({ withChords: true });

    const jazz = exportToYuE2Abc(jazzDoc, { cot: "full" });
    const score = exportToYuE2Abc(scoreDoc, { cot: "full" });

    assert.match(jazz.abc, /Q:1\/4=88/);
    assert.match(score.abc, /Q:1\/4=88/);

    const stripChords = (abc: string) =>
      normalizeAbc(abc).replace(/"[^"]*"/g, "");
    assert.equal(stripChords(jazz.abc), stripChords(score.abc));
    assert.equal(stripChords(jazz.abc), stripChords(loadFixture("score.abc")));

    assert.match(jazz.abc, /"Cmaj7"/);
    assert.notEqual(normalizeAbc(jazz.abc), loadFixture("score.abc"));
    assert.equal(normalizeAbc(jazz.abc), loadFixture("score-jazz.abc"));
  });

  it("refuse cot=off avec ABC", () => {
    const doc = buildTonightAwakeFixture({ withChords: false });
    const v = validateForAbcExport(doc, { cot: "off" });
    assert.equal(v.ok, false);
    assert.equal(v.issues[0]?.code, "abc_with_cot_off");
  });
});

describe("pitch helpers", () => {
  it("round-trip MIDI ↔ ABC for fixture pitches", () => {
    for (const midi of [60, 62, 64, 65, 67, 69, 71, 72]) {
      assert.equal(abcPitchToMidi(midiToAbcPitch(midi)), midi);
    }
  });
});
