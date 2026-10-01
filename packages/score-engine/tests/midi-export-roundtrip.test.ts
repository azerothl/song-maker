import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalMidi,
  exportScoreDocumentToMidi,
  importMidiToScoreDocument,
  transposeScore,
  diffScoreDocuments,
  mergeScoreDocuments,
  INTERNAL_PPQ,
} from "../src/index.js";

describe("MIDI export round-trip", () => {
  it("exporte puis réimporte notes, tempo et vélocité", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 96,
      notes: [
        { startTick: 0, durationTick: 480, pitch: 60, velocity: 100 },
        { startTick: 480, durationTick: 480, pitch: 64, velocity: 80 },
      ],
    });
    const { document: original } = importMidiToScoreDocument(midi, {
      id: "rt-in",
    });
    const exported = exportScoreDocumentToMidi(original);
    const { document: again } = importMidiToScoreDocument(exported, {
      id: "rt-out",
    });

    assert.equal(again.ppq, INTERNAL_PPQ);
    assert.equal(again.tempoMap[0]?.quarterBpm, 96);
    const notes = again.voices.flatMap((v) => v.notes);
    assert.equal(notes.length, 2);
    assert.equal(notes[0]?.pitch, 60);
    assert.equal(notes[0]?.velocity, 100);
    assert.equal(notes[0]?.startTick, 0);
    assert.equal(notes[0]?.durationTick, 480);
    assert.equal(notes[1]?.pitch, 64);
    assert.equal(notes[1]?.velocity, 80);
  });

  it("transposeScore décale les hauteurs", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 120,
      notes: [{ startTick: 0, durationTick: 480, pitch: 60 }],
    });
    const { document } = importMidiToScoreDocument(midi);
    const up = transposeScore(document, 2);
    assert.equal(up.voices[0]?.notes[0]?.pitch, 62);
    const down = transposeScore(document, -12);
    assert.equal(down.voices[0]?.notes[0]?.pitch, 48);
  });
});

describe("score diff + merge", () => {
  it("diffScoreDocuments détecte notes divergentes", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 120,
      notes: [{ startTick: 0, durationTick: 480, pitch: 60 }],
    });
    const { document: a } = importMidiToScoreDocument(midi, { id: "a" });
    const b = {
      ...a,
      id: "b",
      voices: a.voices.map((v) => ({
        ...v,
        notes: v.notes.map((n) => ({ ...n, pitch: 62 })),
      })),
    };
    const diff = diffScoreDocuments(a, b);
    assert.equal(diff.noteDiffs.length, 1);
    assert.equal(diff.noteDiffs[0]?.kind, "changed");
  });

  it("mergeScoreDocuments refuse les conflits non résolus", () => {
    const midi = buildMinimalMidi({
      ppq: 960,
      tempoBpm: 120,
      notes: [{ startTick: 0, durationTick: 480, pitch: 60 }],
    });
    const { document: a } = importMidiToScoreDocument(midi, { id: "a" });
    const noteId = a.voices[0]!.notes[0]!.id;
    const voiceId = a.voices[0]!.id;
    const b = {
      ...a,
      id: "b",
      voices: a.voices.map((v) => ({
        ...v,
        notes: v.notes.map((n) => ({ ...n, pitch: 67 })),
      })),
    };
    assert.throws(() =>
      mergeScoreDocuments(a, b, { noteChoices: {}, metaSide: "left" }),
    );
    const merged = mergeScoreDocuments(
      a,
      b,
      {
        noteChoices: { [`${voiceId}:${noteId}`]: "right" },
        metaSide: "left",
      },
      { branchName: "merged-test" },
    );
    assert.equal(merged.voices[0]?.notes[0]?.pitch, 67);
    assert.equal(merged.branchName, "merged-test");
  });
});
