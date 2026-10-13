import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScoreDocument } from "@song-maker/score-engine";
import type { MixDoc, MixTrack } from "./types";
import {
  hasNativeMidiVst3Request,
  needsOfflineTrackVst3Bake,
} from "./vst3RealtimePolicy";

function track(role: string, enabled = true): MixTrack {
  return {
    id: `${role}-track`,
    role,
    name: role,
    gainDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    locked: false,
    aiSeparated: false,
    clips: [],
    vst3Effects: enabled
      ? [
          {
            id: "fx-1",
            pluginPath: "effect.vst3",
            pluginName: "Effect",
            enabled: true,
            parameters: {},
          },
        ]
      : [],
  };
}

function mix(tracks: MixTrack[]): MixDoc {
  return {
    schema: "songmaker.mix",
    schemaVersion: 1,
    id: "mix-1",
    separationId: "",
    sampleRate: 48_000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks,
    tempoMap: [],
    timeSignatures: [],
    markers: [],
  };
}

function score(voiceId: string, noteCount: number): ScoreDocument {
  return {
    voices: [
      {
        id: voiceId,
        name: "MIDI",
        role: "other",
        abcVoice: "Ins",
        notes: Array.from({ length: noteCount }, (_, index) => ({
          id: `note-${index}`,
          startTick: index * 480,
          durationTick: 480,
          pitch: 60,
          velocity: 90,
        })),
      },
    ],
  } as ScoreDocument;
}

describe("VST3 realtime playback policy", () => {
  it("does not request a stem bake for an empty MIDI track with an insert", () => {
    const document = mix([track("midi")]);
    assert.equal(needsOfflineTrackVst3Bake(document, false), false);
    assert.equal(hasNativeMidiVst3Request(document, score("midi-track", 0)), false);
  });

  it("keeps a populated MIDI insert on the native realtime path", () => {
    const document = mix([track("midi")]);
    assert.equal(hasNativeMidiVst3Request(document, score("midi-track", 1)), true);
    assert.equal(needsOfflineTrackVst3Bake(document, false), false);
  });

  it("retains the offline fallback for audio-track inserts", () => {
    assert.equal(needsOfflineTrackVst3Bake(mix([track("vocals")]), false), true);
    assert.equal(needsOfflineTrackVst3Bake(mix([track("vocals")]), true), false);
  });
});
