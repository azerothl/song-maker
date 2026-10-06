import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildTonightAwakeFixture,
  convertVocalToIns,
  createSemanticPrefixClient,
  DesktopSemanticPrefixClient,
  dialectRefusal,
  importAbcToScoreDocument,
  isAcceptedChordSymbol,
  planSemanticPrefixContinuation,
  ScoreEngineError,
  SEMANTIC_PREFIX_ENABLED,
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

describe("semantic_prefix continuation", () => {
  const truncatedParent = {
    generationId: "gen-001",
    semanticTruncated: true,
    semanticJsonPath: "/projects/p/generations/gen-001/semantic.json",
    frameCount: 750,
    hasScoreAbc: true,
  };

  it("planifie les options pour une génération tronquée", async () => {
    assert.equal(SEMANTIC_PREFIX_ENABLED, true);
    const client = createSemanticPrefixClient();
    assert.equal(client.isEnabled(), true);
    const result = await client.continueFromPrefix({
      style: "pop",
      lyrics: "[Verse]\nSuite",
      cot: "full",
      seed: 1,
      parent: truncatedParent,
    });
    assert.equal(result.jobKind, "continuation");
    assert.equal(result.audioPath, null);
    assert.equal(result.frameCount, 750);
    assert.deepEqual(result.taskOptions, {
      semantic_prefix_file: truncatedParent.semanticJsonPath,
      export_semantic: true,
    });
  });

  it("refuse si semantic.json manque", () => {
    assert.throws(
      () =>
        planSemanticPrefixContinuation({
          style: "pop",
          lyrics: "[Verse]\nSuite",
          cot: "full",
          seed: 1,
          parent: {
            ...truncatedParent,
            semanticJsonPath: null,
            frameCount: 0,
          },
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError &&
        err.code === "validation_failed" &&
        /artefact sémantique/.test(err.message),
    );
  });

  it("refuse si la génération source n’est pas tronquée", () => {
    assert.throws(
      () =>
        planSemanticPrefixContinuation({
          style: "pop",
          lyrics: "[Verse]\nSuite",
          cot: "melody",
          seed: 1,
          parent: { ...truncatedParent, semanticTruncated: false },
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError &&
        err.code === "validation_failed" &&
        /tronquées/.test(err.message),
    );
  });

  it("reste not_implemented si le client est forcé gated", async () => {
    const client = new DesktopSemanticPrefixClient(false);
    await assert.rejects(
      () =>
        client.continueFromPrefix({
          style: "pop",
          lyrics: "[Verse]\nSuite",
          cot: "full",
          seed: 1,
          parent: truncatedParent,
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "not_implemented",
    );
  });
});

describe("Vocal → Ins", () => {
  it("déplace les notes du fixture score", () => {
    const abc = readFileSync(join(root, "fixtures/score.abc"), "utf8");
    const { abc: out, movedNoteCount } = convertVocalToIns(abc);
    assert.ok(movedNoteCount > 0);
    assert.match(out, /V: Ins[\s\S]*E2G2A2G2/);
    assert.match(out, /V: Vocal[\s\S]*"C"z16\|/);
  });

  it("conserve l'ABC quand la portée Vocal est déjà vide", () => {
    const abc = [
      "X:1", "T:Instrumental", "M:4/4", "L:1/16", "Q:1/4=88",
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
      'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:G",
      "% intro", "V: Vocal", '"G"z16|"G"z16|',
      "V: Ins", "G4B4d4B4|G4B4d4B4|", "",
    ].join("\n");

    const result = convertVocalToIns(abc);

    assert.equal(result.abc, abc);
    assert.equal(result.movedNoteCount, 0);
  });

  it("transfère la mélodie et conserve les parties instrumentales hors chevauchement", () => {
    const abc = [
      "X:1", "T:Test", "M:4/4", "L:1/16", "Q:1/4=88",
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
      'V: Ins clef=treble name="Ins Melody" snm="Inst."', "K:C",
      "% verse", "V: Vocal", '"C"C4"F"z4z8|', "V: Ins", "G8D8|", "",
    ].join("\n");

    const { abc: out, movedNoteCount } = convertVocalToIns(abc);
    const { document, issues } = importAbcToScoreDocument(out);
    const ins = document.voices.find((voice) => voice.abcVoice === "Ins");

    assert.equal(movedNoteCount, 1);
    assert.deepEqual(issues, []);
    assert.deepEqual(
      ins?.notes.map((note) => [note.startTick, note.durationTick, note.pitch]),
      [
        [0, 960, 60],
        [960, 960, 67],
        [1920, 1920, 62],
      ],
    );
    assert.equal(document.voices.find((voice) => voice.abcVoice === "Vocal")?.notes.length, 0);
    assert.deepEqual(
      document.chordEvents.map((chord) => [chord.tick, chord.symbol]),
      [[0, "C"], [960, "F"]],
    );
  });

  it("refuse de supprimer silencieusement une troisième voix", () => {
    const abc = [
      "X:1", "T:Test", "M:4/4", "L:1/16", "Q:1/4=88",
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
      'V: Ins clef=treble name="Ins Melody" snm="Inst."',
      'V: Bass clef=bass name="Bass"', "K:C", "% verse",
      "V: Vocal", "C4z12|", "V: Ins", "Z|", "V: Bass", "C,16|", "",
    ].join("\n");

    assert.throws(() => convertVocalToIns(abc), /voix supplémentaires/);
  });
});
