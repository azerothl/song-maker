import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basicPitchQualityKey,
  midiBytesToUint8Array,
  trackHasAudioClip,
} from "./basicPitchProduct.ts";
import type { MixClip, MixTrack } from "./types.ts";

const clip = (sourcePath: string): MixClip => ({
  id: "c1",
  trackId: "t1",
  sourcePath,
  sourceSha256: "abc",
  startMs: 0,
  offsetMs: 0,
  durationMs: 1000,
  gainDb: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
});

const track = (role: string, sourcePath: string): MixTrack => ({
  id: "t1",
  role,
  name: role,
  gainDb: 0,
  pan: 0,
  mute: false,
  solo: false,
  locked: false,
  aiSeparated: false,
  clips: [clip(sourcePath)],
});

describe("BasicPitch product (#346)", () => {
  it("maps track roles to the trial quality notes", () => {
    assert.equal(basicPitchQualityKey("vocals"), "basicPitch.quality.vocals");
    assert.equal(basicPitchQualityKey("bass"), "basicPitch.quality.bass");
    assert.equal(basicPitchQualityKey("piano"), "basicPitch.quality.piano");
    assert.equal(basicPitchQualityKey("drums"), "basicPitch.quality.drums");
    assert.equal(basicPitchQualityKey("other"), "basicPitch.quality.other");
  });

  it("requires a clip with audio", () => {
    assert.equal(trackHasAudioClip(track("vocals", "stems/v.wav")), true);
    assert.equal(trackHasAudioClip(track("vocals", "")), false);
  });

  it("normalizes Tauri MIDI byte arrays", () => {
    const raw = [0x4d, 0x54, 0x68, 0x64];
    const out = midiBytesToUint8Array(raw);
    assert.equal(out.byteLength, 4);
    assert.equal(out[0], 0x4d);
  });
});
