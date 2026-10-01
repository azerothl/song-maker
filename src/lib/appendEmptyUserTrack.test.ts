import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendEmptyUserTrack } from "./appendEmptyUserTrack.ts";
import type { MixDoc } from "./types.ts";

function baseMix(): MixDoc {
  return {
    schema: "mix",
    schemaVersion: 1,
    id: "mix-1",
    separationId: "",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [],
    tempoMap: [],
    timeSignatures: [],
    markers: [],
  };
}

describe("appendEmptyUserTrack (#226)", () => {
  it("ajoute une piste user sans clips", () => {
    const next = appendEmptyUserTrack(baseMix());
    assert.equal(next.tracks.length, 1);
    assert.equal(next.tracks[0].role, "user");
    assert.equal(next.tracks[0].aiSeparated, false);
    assert.deepEqual(next.tracks[0].clips, []);
    assert.equal(next.tracks[0].name, "Piste vide");
  });

  it("déduplique le nom", () => {
    const once = appendEmptyUserTrack(baseMix());
    const twice = appendEmptyUserTrack(once);
    assert.equal(twice.tracks[1].name, "Piste vide (2)");
  });
});
