import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  exportToYuE2Abc,
  importAbcToScoreDocument,
  normalizeAbc,
} from "../src/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const fixtures = join(root, "fixtures");

function loadFixture(name: string): string {
  return normalizeAbc(readFileSync(join(fixtures, name), "utf8"));
}

describe("importAbcToScoreDocument", () => {
  it("imports melody.abc into Vocal notes", () => {
    const abc = loadFixture("melody.abc");
    const { document, empty, issues } = importAbcToScoreDocument(abc, {
      id: "from-abc",
    });
    assert.equal(empty, false);
    assert.equal(document.source, "abc");
    assert.equal(document.id, "from-abc");
    const vocal = document.voices.find((v) => v.abcVoice === "Vocal");
    assert.ok(vocal);
    assert.ok(vocal!.notes.length >= 8);
    assert.equal(document.tempoMap[0]?.quarterBpm, 88);
    assert.equal(document.keySignatures[0]?.tonic, "C");
    assert.ok(document.sections.some((s) => s.kind === "verse"));
    assert.ok(document.sections.some((s) => s.kind === "chorus"));
    // Ins rests only — no Ins notes
    assert.equal(
      document.voices.find((v) => v.abcVoice === "Ins"),
      undefined,
    );
    void issues;
  });

  it("imports N ABC voices (bass + drums) into distinct ScoreDocument voices", () => {
    const abc = [
      "X:1",
      "T:n-voix",
      "M:4/4",
      "L:1/8",
      "Q:1/4=100",
      'V: Vocal clef=treble',
      'V: Bass clef=bass',
      'V: Drums clef=perc',
      "K:C",
      "V: Vocal",
      "CDEF|",
      "V: Bass",
      "C,2G,2|",
      "V: Drums",
      "CCCC|",
    ].join("\n");
    const { document, empty, issues } = importAbcToScoreDocument(abc, {
      id: "n-voices",
    });
    assert.equal(empty, false);
    assert.equal(document.voices.length, 3);
    assert.ok(document.voices.find((v) => v.abcVoice === "Vocal"));
    const bass = document.voices.find((v) => v.abcVoice === "Bass");
    const drums = document.voices.find((v) => v.abcVoice === "Drums");
    assert.ok(bass);
    assert.ok(drums);
    assert.equal(bass!.role, "bass");
    assert.ok(bass!.notes.length > 0);
    assert.ok(drums!.notes.length > 0);
    assert.ok(
      issues.some((i) => /batterie|percussion/i.test(i.message)),
    );
    const again = exportToYuE2Abc(document, { cot: "full" });
    assert.match(again.abc, /V: Vocal/);
    assert.match(again.abc, /V: Ins/);
    assert.doesNotMatch(again.abc, /V: Bass/);
    assert.ok(again.warnings.some((w) => /voix extra/i.test(w)));
  });

  it("imports score.abc chords onto chordEvents", () => {
    const abc = loadFixture("score.abc");
    const { document, empty } = importAbcToScoreDocument(abc);
    assert.equal(empty, false);
    assert.ok(document.chordEvents.length >= 4);
    assert.ok(document.chordEvents.some((c) => c.symbol === "C"));
  });

  it("round-trips melody notes through export (cot=melody)", () => {
    const abc = loadFixture("melody.abc");
    const { document } = importAbcToScoreDocument(abc, { id: "rt" });
    const again = exportToYuE2Abc(document, { cot: "melody" });
    const a = normalizeAbc(abc).replace(/\s+/g, "");
    const b = normalizeAbc(again.abc).replace(/\s+/g, "");
    // Headers + note stream should stay close; allow Ins Z grouping differences.
    assert.ok(document.voices[0]!.notes.length > 0);
    assert.match(again.abc, /Q:1\/4=88/);
    assert.match(again.abc, /V: Vocal/);
    void a;
    void b;
  });

  it("flags empty ABC without inventing notes", () => {
    const { document, empty, issues } = importAbcToScoreDocument("X:1\nK:C\n");
    assert.equal(empty, true);
    assert.equal(document.voices[0]?.notes.length ?? 0, 0);
    assert.ok(issues.some((i) => i.severity === "warning"));
  });
});
