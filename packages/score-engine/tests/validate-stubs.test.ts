import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildTonightAwakeFixture,
  convertVocalToIns,
  createCandidateComparer,
  createClipEditor,
  createSemanticPrefixClient,
  createStopAfterAbcClient,
  dialectRefusal,
  isAcceptedChordSymbol,
  ScoreEngineError,
  validateForAbcExport,
} from "../src/index.js";

const root = dirname(fileURLToPath(import.meta.url));

describe("validation / dialecte", () => {
  it("refuse les accords hors vocabulaire", () => {
    assert.equal(isAcceptedChordSymbol("C"), true);
    assert.equal(isAcceptedChordSymbol("F#m7/C#"), true);
    assert.equal(isAcceptedChordSymbol("C13"), false);
    assert.equal(isAcceptedChordSymbol("Cmaj9"), false);
    assert.equal(isAcceptedChordSymbol("C:maj"), false);

    const doc = buildTonightAwakeFixture({ withChords: true });
    doc.chordEvents = [{ tick: 0, symbol: "C13" }];
    const v = validateForAbcExport(doc, { cot: "full" });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "invalid_chord"));
  });

  it("refuse la polyphonie Vocal qui se chevauche", () => {
    const doc = buildTonightAwakeFixture({ withChords: false });
    const voice = doc.voices[0]!;
    voice.notes.push({
      id: "overlap",
      startTick: voice.notes[0]!.startTick,
      durationTick: voice.notes[0]!.durationTick,
      pitch: 72,
      velocity: 80,
    });
    const v = validateForAbcExport(doc, { cot: "melody" });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "overlapping_vocal_notes"));
  });

  it("refuse tempo manquant sans inventer 120", () => {
    const doc = buildTonightAwakeFixture({ withChords: false });
    doc.tempoMap = [];
    const v = validateForAbcExport(doc, { cot: "melody" });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "missing_tempo"));
  });

  it("dialectRefusal porte le message hors dialecte YuE2", () => {
    const issue = dialectRefusal("triolets");
    assert.match(issue.message, /hors dialecte YuE2/);
  });
});

describe("stubs phase 2", () => {
  it("clip editor lève not_implemented", () => {
    const editor = createClipEditor();
    assert.throws(
      () => editor.apply([], { kind: "fade", clipId: "c1", fadeInMs: 10 }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "not_implemented",
    );
  });

  it("comparateur multi-candidats sans gagnant automatique", () => {
    const cmp = createCandidateComparer();
    const view = cmp.openCompare([
      {
        id: "a",
        generationFolder: "gen-001",
        seed: 1,
        createdAt: "2026-09-26T00:00:00Z",
        audioPath: "a.wav",
        scoreAbcPath: null,
      },
      {
        id: "b",
        generationFolder: "gen-002",
        seed: 2,
        createdAt: "2026-09-26T00:01:00Z",
        audioPath: "b.wav",
        scoreAbcPath: null,
      },
    ]);
    assert.equal(view.selectedId, null);
    assert.equal(cmp.select(view, "b").selectedId, "b");
  });

  it("stop_after=abc refuse cot=off et ABC externe", async () => {
    const client = createStopAfterAbcClient();
    await assert.rejects(
      () =>
        client.run({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "off",
          seed: 1,
          stopAfter: "abc",
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "abc_with_cot_off",
    );
    await assert.rejects(
      () =>
        client.run({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "full",
          seed: 1,
          stopAfter: "abc",
          abcPath: "x.abc",
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "validation_failed",
    );
  });

  it("semantic_prefix stub not_implemented", async () => {
    const client = createSemanticPrefixClient();
    await assert.rejects(
      () =>
        client.continueFromPrefix({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "full",
          seed: 1,
          semanticPrefix: { frames: [[1, 2]], sampleRateHintHz: 25 },
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "not_implemented",
    );
  });

  it("Vocal → Ins déplace les notes du fixture score", () => {
    const abc = readFileSync(join(root, "fixtures/score.abc"), "utf8");
    const { abc: out, movedNoteCount } = convertVocalToIns(abc);
    assert.ok(movedNoteCount > 0);
    assert.match(out, /V: Ins\nE2G2A2G2/);
    assert.match(out, /V: Vocal\nZ4\|/);
  });
});
