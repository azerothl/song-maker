import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalMidi,
  exportToYuE2Abc,
  importMidiToScoreDocument,
  validateForAbcExport,
} from "@song-maker/score-engine";
import {
  createEmptyScoreDocument,
  exportScoreAbc,
  exportScoreMidi,
  importMidiBytes,
  addNote,
  mergeScoreVoiceVst3InstrumentState,
  prepareAbcForGeneration,
  setScoreVoiceVst3Instrument,
  transposeWholeScore,
  updateScoreTempo,
} from "./score.ts";

describe("phase 2 score wiring", () => {
  it("importe MIDI via le wrapper app", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 88,
      notes: [
        { startTick: 0, durationTick: 480, pitch: 60 },
        { startTick: 480, durationTick: 480, pitch: 62 },
      ],
    });
    const { document } = importMidiBytes(midi, { id: "app-midi" });
    assert.equal(document.source, "midi");
    assert.equal(document.tempoMap[0]?.quarterBpm, 88);
  });

  it("garde le chemin phase 1 sans partition", () => {
    const r = prepareAbcForGeneration(null, "full", "Titre");
    assert.equal(r.abc, null);
    assert.equal(r.error, null);
  });

  it("refuse ABC + cot=off", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 100,
      notes: [{ startTick: 0, durationTick: 960, pitch: 64 }],
    });
    const { document } = importMidiToScoreDocument(midi);
    const r = prepareAbcForGeneration(document, "off", "X");
    assert.equal(r.abc, null);
    assert.match(r.error ?? "", /cot=off/);
  });

  it("exporte ABC validé pour cot=melody", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 88,
      notes: [{ startTick: 0, durationTick: 960, pitch: 60 }],
    });
    let { document } = importMidiToScoreDocument(midi, { id: "exp" });
    document = updateScoreTempo(document, 88);
    const r = prepareAbcForGeneration(document, "melody", "Test");
    assert.equal(r.error, null);
    assert.ok(r.abc?.includes("V: Vocal"));
    assert.ok(r.abc?.includes("Q:1/4=88"));
    const again = exportScoreAbc(document, "melody", "Test");
    assert.ok(again.abc.length > 0);
  });

  it("score-engine export reste cohérent", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 120,
      notes: [{ startTick: 0, durationTick: 240, pitch: 67 }],
    });
    const { document } = importMidiToScoreDocument(midi);
    const v = validateForAbcExport(document, { cot: "full" });
    assert.equal(v.ok, true);
    const { abc } = exportToYuE2Abc(document, { cot: "full", title: "T" });
    assert.ok(abc.startsWith("X:1"));
  });

  it("crée une partition vide avec voix Vocal", () => {
    const doc = createEmptyScoreDocument({ branchName: "main" });
    assert.equal(doc.source, "manual");
    assert.equal(doc.voices[0]?.abcVoice, "Vocal");
    assert.equal(doc.branchName, "main");
    assert.equal(doc.timeSignatures[0]?.numerator, 4);
  });

  it("fusionne l’état VST3 sans effacer les notes ajoutées pendant l’ouverture", () => {
    const doc = createEmptyScoreDocument({ branchName: "main" });
    const voiceId = doc.voices[0]!.id;
    const pluginPath = "C:\\VST3\\Odin2.vst3";
    const assigned = setScoreVoiceVst3Instrument(doc, voiceId, {
      pluginPath,
      pluginName: "Odin2",
      parameters: { "1": 0.25 },
      stateB64: "before",
    });
    const note = {
      id: "note-added-while-editor-open",
      startTick: 360,
      durationTick: 480,
      pitch: 84,
      velocity: 90,
    };
    const latestDocument = addNote(assigned, voiceId, note);

    const updated = mergeScoreVoiceVst3InstrumentState(
      latestDocument,
      voiceId,
      pluginPath,
      { parameters: { "1": 0.75 }, stateB64: "after" },
    );

    assert.deepEqual(updated.voices[0]?.notes, [note]);
    assert.deepEqual(updated.voices[0]?.vst3Instrument?.parameters, { "1": 0.75 });
    assert.equal(updated.voices[0]?.vst3Instrument?.stateB64, "after");
  });

  it("n’applique pas l’état d’un éditeur à une voix dont l’instrument a changé", () => {
    const doc = createEmptyScoreDocument({ branchName: "main" });
    const voiceId = doc.voices[0]!.id;
    const assigned = setScoreVoiceVst3Instrument(doc, voiceId, {
      pluginPath: "C:\\VST3\\Other.vst3",
      pluginName: "Other",
      parameters: {},
    });

    const updated = mergeScoreVoiceVst3InstrumentState(
      assigned,
      voiceId,
      "C:\\VST3\\Odin2.vst3",
      { parameters: { "1": 0.75 } },
    );

    assert.strictEqual(updated, assigned);
  });

  it("exporte MIDI via le wrapper app (round-trip)", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 100,
      notes: [{ startTick: 0, durationTick: 480, pitch: 60, velocity: 110 }],
    });
    const { document } = importMidiBytes(midi, { id: "exp-midi" });
    const bytes = exportScoreMidi(document);
    assert.ok(bytes.byteLength > 20);
    const again = importMidiBytes(bytes);
    const notes = again.document.voices.flatMap((v) => v.notes);
    assert.equal(notes[0]?.pitch, 60);
    assert.equal(notes[0]?.velocity, 110);
    const transposed = transposeWholeScore(document, 1);
    assert.equal(transposed.voices[0]?.notes[0]?.pitch, 61);
  });
});
