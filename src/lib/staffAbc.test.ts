import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimalMidi,
  importMidiToScoreDocument,
} from "@song-maker/score-engine";
import { createEmptyScoreDocument } from "./score.ts";
import { buildStaffAbc } from "./staffAbc.ts";

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
