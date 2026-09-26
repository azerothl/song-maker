import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyQuantization,
  buildMinimalMidi,
  importMidiToScoreDocument,
  INTERNAL_PPQ,
  validateForAbcExport,
} from "../src/index.js";

describe("MIDI → ScoreDocument", () => {
  it("importe une piste mono, convertit vers PPQ 960", () => {
    const midi = buildMinimalMidi({
      ppq: 480,
      tempoBpm: 88,
      notes: [
        { startTick: 0, durationTick: 240, pitch: 64 },
        { startTick: 240, durationTick: 240, pitch: 67 },
      ],
    });
    const { document, originalTracks, issues } = importMidiToScoreDocument(
      midi,
      { id: "midi-test" },
    );

    assert.equal(document.ppq, INTERNAL_PPQ);
    assert.equal(document.source, "midi");
    assert.equal(document.tempoMap[0]?.quarterBpm, 88);
    assert.equal(originalTracks.length, 1);
    assert.equal(document.voices[0]?.notes.length, 2);
    // 480 PPQ → 960 : ticks × 2
    assert.equal(document.voices[0]?.notes[0]?.startTick, 0);
    assert.equal(document.voices[0]?.notes[0]?.durationTick, 480);
    assert.equal(document.voices[0]?.notes[0]?.pitch, 64);
    assert.ok(Array.isArray(issues));
  });

  it("ne quantifie pas sans confirmation", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 120,
      notes: [{ startTick: 10, durationTick: 100, pitch: 60 }],
    });
    const { document, suggestedQuantizeTicks } = importMidiToScoreDocument(midi);
    assert.equal(document.voices[0]?.notes[0]?.startTick, 10);
    assert.equal(suggestedQuantizeTicks, 120);

    const quantized = applyQuantization(document, 120);
    assert.equal(quantized.voices[0]?.notes[0]?.startTick, 0);
  });

  it("signale une tempo map trop longue à l’export", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 88,
      notes: [{ startTick: 0, durationTick: 960, pitch: 60 }],
    });
    const { document } = importMidiToScoreDocument(midi);
    document.tempoMap.push({ tick: 1920, quarterBpm: 100 });
    const v = validateForAbcExport(document, { cot: "melody" });
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => i.code === "tempo_map_too_long"));
  });
});
