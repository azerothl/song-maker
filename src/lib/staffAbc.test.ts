import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalMidi,
  importMidiToScoreDocument,
} from "@song-maker/score-engine";
import { createEmptyScoreDocument } from "./score.ts";
import {
  abcBarDurationSeconds,
  buildStaffAbc,
  sliceAbcMeasures,
  splitAbcMeasures,
} from "./staffAbc.ts";

describe("buildStaffAbc", () => {
  it("exporte une portée depuis un MIDI minimal", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 100,
      notes: [
        { startTick: 0, durationTick: 480, pitch: 60 },
        { startTick: 480, durationTick: 480, pitch: 64 },
      ],
    });
    const { document } = importMidiToScoreDocument(midi, { id: "staff-midi" });
    const result = buildStaffAbc(document, "Staff");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.abc, /^X:1/m);
    assert.match(result.abc, /K:/);
    assert.match(result.abc, /Q:1\/4=100/);
    assert.match(result.abc, /V: Vocal/);
  });

  it("signale un ABC illisible sans inventer de notes", () => {
    const result = buildStaffAbc({
      ...createEmptyScoreDocument(),
      // Force invalid tempo map (YuE2 refuses mid-song stretch / missing honest tempo)
      tempoMap: [],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.error.length > 0);
  });
});

/**
 * Reproduit la structure réelle de `exportScoreAbc` : déclarations `V:` dans
 * l'en-tête, puis blocs alternés `V: <voix>` + 4 mesures, `% other` en
 * commentaire d'en-tête.
 */
const TUNE = `X:1
T:Chanson
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% other
V: Vocal
A1B1c1d1|A1B1c1d2|
V: Ins
Z2|
V: Vocal
e1f1g1a1|e1f1g1a2|
V: Ins
Z2|
V: Vocal
b1c2d2e2|f2g2a2b2|
V: Ins
Z2|`;

describe("splitAbcMeasures", () => {
  it("range les mesures par voix et compte les positions temporelles", () => {
    const { header, blocks, barCount, windowable } = splitAbcMeasures(TUNE);
    assert.equal(windowable, true);
    assert.match(header, /^X:1/);
    // Les déclarations V: de l'en-tête restent dans l'en-tête.
    assert.match(header, /V: Vocal clef=treble/);
    assert.match(header, /V: Ins clef=treble/);
    // 6 mesures par voix.
    assert.equal(barCount, 6);
    assert.deepEqual(
      blocks.map((b) => b.voice),
      ["Vocal", "Ins"],
    );
    assert.equal(blocks[0]?.bars.length, 6);
    // Z2 est déplié : 3 repos de 2 mesures donnent 6 positions, comme Vocal.
    assert.equal(blocks[1]?.bars.length, 6);
  });

  it("déplie les repos multi-mesures pour aligner les voix", () => {
    const { blocks } = splitAbcMeasures(TUNE);
    assert.equal(blocks[0]?.bars.length, blocks[1]?.bars.length);
    assert.equal(blocks[1]?.bars.every((b) => b === "Z"), true);
  });

  it("n'entend pas le commentaire % de l'en-tête comme un repeat", () => {
    assert.equal(splitAbcMeasures(TUNE).windowable, true);
  });

  it("refuse le fenêtrage si le corps contient des repeats", () => {
    assert.equal(
      splitAbcMeasures(TUNE.replace("A1B1c1d1|", "%:A1B1c1d1|")).windowable,
      false,
    );
    assert.equal(
      splitAbcMeasures(TUNE.replace("A1B1c1d2|", "A1B1c1d2:|")).windowable,
      false,
    );
  });

  it("ignore les lignes vides", () => {
    assert.equal(
      splitAbcMeasures(TUNE.replace(/\n/g, "\n\n")).barCount,
      6,
    );
  });
});

describe("abcBarDurationSeconds", () => {
  it("calcule la durée d'une mesure depuis M: et Q:", () => {
    // 4/4 à 120 bpm => 4 noires => 4 x 0,5 s.
    assert.equal(abcBarDurationSeconds("M:4/4\nQ:1/4=120"), 2);
    assert.equal(abcBarDurationSeconds("M:3/4\nQ:1/4=120"), 1.5);
    // 6/8 : six croches de 0,25 s.
    assert.equal(abcBarDurationSeconds("M:6/8\nQ:1/4=120"), 1.5);
    // Q: sans fraction explicite.
    assert.equal(abcBarDurationSeconds("M:4/4\nQ:=90"), (4 * 60) / 90);
  });

  it("renvoie null sans métrique ou tempo déclarés", () => {
    assert.equal(abcBarDurationSeconds("M:4/4"), null);
    assert.equal(abcBarDurationSeconds("Q:1/4=120"), null);
  });

  it("renvoie null sur une métrique incohérente", () => {
    assert.equal(abcBarDurationSeconds("M:4/0\nQ:1/4=120"), null);
    assert.equal(abcBarDurationSeconds("M:4/4\nQ:1/4=0"), null);
  });

  it("reconnaît la métrique du tune d'exemple", () => {
    assert.equal(abcBarDurationSeconds(splitAbcMeasures(TUNE).header), 2);
  });
});

describe("sliceAbcMeasures", () => {
  it("garde les en-têtes et les deux voix dans la fenêtre", () => {
    const sliced = sliceAbcMeasures(TUNE, 0, 2);
    assert.match(sliced, /^X:1/);
    assert.match(sliced, /V: Vocal clef=treble/);
    assert.match(sliced, /^V: Vocal$/m);
    assert.match(sliced, /^V: Ins$/m);
    assert.equal(splitAbcMeasures(sliced).barCount, 2);
  });

  it("tronque toutes les voix à la même position temporelle", () => {
    const full = splitAbcMeasures(TUNE);
    const vocal = full.blocks[0]!.bars;
    const start = 2;
    const count = 3;
    const sliced = splitAbcMeasures(sliceAbcMeasures(TUNE, start, count));
    assert.deepEqual(sliced.blocks[0]!.bars, vocal.slice(start, start + count));
  });

  it("aligne la fenêtre demandée sur les parties jouées", () => {
    const full = splitAbcMeasures(TUNE);
    const start = 4;
    const count = 2;
    const sliced = splitAbcMeasures(sliceAbcMeasures(TUNE, start, count));
    assert.deepEqual(sliced.blocks[0]!.bars, full.blocks[0]!.bars.slice(start, start + count));
    assert.deepEqual(sliced.blocks[1]!.bars, full.blocks[1]!.bars.slice(start, start + count));
  });

  it("couvre l'intégralité du tune par fenêtres consécutives", () => {
    const split = splitAbcMeasures(TUNE);
    for (const voice of split.blocks) {
      const seen: string[] = [];
      for (const start of [0, 2, 4]) {
        seen.push(
          ...splitAbcMeasures(sliceAbcMeasures(TUNE, start, 2)).blocks.find(
            (b) => b.voice === voice.voice,
          )!.bars,
        );
      }
      assert.deepEqual(seen, voice.bars);
    }
  });

  it("borne le départ dans la plage valide", () => {
    const vocal = splitAbcMeasures(TUNE).blocks[0]!.bars;
    const tooFar = splitAbcMeasures(sliceAbcMeasures(TUNE, 999, 2)).blocks[0]!.bars;
    assert.deepEqual(tooFar, vocal.slice(-1));
    const negative = splitAbcMeasures(sliceAbcMeasures(TUNE, -5, 2)).blocks[0]!.bars;
    assert.equal(negative.length, 2);
  });

  it("renvoie le tune intact quand il n'est pas fenêtrable", () => {
    const withRepeat = TUNE.replace("A1B1c1d1|", "%:A1B1c1d1|");
    assert.equal(sliceAbcMeasures(withRepeat, 2, 2), withRepeat);
  });

  it("ne perd aucun accord ni tempo de l'en-tête", () => {
    const sliced = sliceAbcMeasures(TUNE, 2, 2);
    assert.match(sliced, /Q:1\/4=120/);
    assert.match(sliced, /K:C/);
  });
});
