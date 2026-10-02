import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MixClip, MixDoc } from "./types.ts";
import {
  applyClipGainEdit,
  clampClipGainDb,
  CLIP_GAIN_DB_MAX,
  CLIP_GAIN_DB_MIN,
  CLIP_GAIN_DB_STEP,
} from "./mixClipGainEdit.ts";

function clip(partial: Partial<MixClip> & Pick<MixClip, "id">): MixClip {
  return {
    trackId: "trk",
    sourcePath: "a.wav",
    sourceSha256: "abc",
    startMs: 0,
    offsetMs: 0,
    durationMs: 1000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...partial,
  };
}

function mixWithClip(c: MixClip): MixDoc {
  return {
    schema: "mix",
    schemaVersion: 1,
    id: "mix-1",
    separationId: "",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: 0,
    tracks: [
      {
        id: "trk",
        name: "Voix",
        role: "vocals",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: false,
        clips: [c],
      },
    ],
  };
}

describe("mixClipGainEdit (#228)", () => {
  it("clampClipGainDb borne −24…+12 et quantifie au pas 0,5", () => {
    assert.equal(clampClipGainDb(-30), CLIP_GAIN_DB_MIN);
    assert.equal(clampClipGainDb(20), CLIP_GAIN_DB_MAX);
    assert.equal(clampClipGainDb(1.24), 1);
    assert.equal(clampClipGainDb(1.26), 1.5);
    assert.equal(clampClipGainDb(NaN), 0);
    assert.equal(CLIP_GAIN_DB_STEP, 0.5);
  });

  it("applyClipGainEdit met à jour le clip ciblé sans toucher les autres", () => {
    const other = clip({ id: "c2", gainDb: -1, startMs: 2000 });
    const doc = mixWithClip(clip({ id: "c1", gainDb: 0 }));
    doc.tracks[0]!.clips.push(other);
    const next = applyClipGainEdit(doc, "trk", "c1", -3.5);
    assert.equal(next.tracks[0]!.clips[0]!.gainDb, -3.5);
    assert.equal(next.tracks[0]!.clips[1]!.gainDb, -1);
    assert.equal(doc.tracks[0]!.clips[0]!.gainDb, 0);
  });

  it("applyClipGainEdit ignore une piste / clip inconnus (no-op structurel)", () => {
    const doc = mixWithClip(clip({ id: "c1" }));
    const sameTrack = applyClipGainEdit(doc, "missing", "c1", 3);
    assert.equal(sameTrack.tracks[0]!.clips[0]!.gainDb, 0);
    const sameClip = applyClipGainEdit(doc, "trk", "missing", 3);
    assert.equal(sameClip.tracks[0]!.clips[0]!.gainDb, 0);
  });
});
