import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasExportableAudio } from "./exportableAudio.ts";
import type { MixDoc, PlaybackSources } from "./types.ts";

function mixWithClip(partial?: Partial<MixDoc["tracks"][0]["clips"][0]>): MixDoc {
  return {
    schema: "song-maker.mix",
    schemaVersion: 1,
    id: "mix-1",
    separationId: "sep-1",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [
      {
        id: "tr-1",
        role: "other",
        name: "Import",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: false,
        clips: [
          {
            id: "clip-1",
            trackId: "tr-1",
            sourcePath: "user/import.wav",
            sourceSha256: "abc",
            startMs: 0,
            offsetMs: 0,
            durationMs: 12_000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            ...partial,
          },
        ],
      },
    ],
  };
}

describe("hasExportableAudio (#279)", () => {
  it("allows import-only mix without a generation", () => {
    assert.equal(hasExportableAudio(mixWithClip(), null), true);
  });

  it("allows playback stems without generationWav", () => {
    const sources: PlaybackSources = {
      mode: "stems",
      generationWav: null,
      label: "user",
      stems: [{ trackId: "tr-1", role: "other", name: "Import", path: "a.wav" }],
    };
    assert.equal(hasExportableAudio(null, sources), true);
  });

  it("rejects empty mix and empty sources", () => {
    assert.equal(hasExportableAudio(null, null), false);
    assert.equal(
      hasExportableAudio(mixWithClip({ durationMs: 0, sourcePath: "" }), null),
      false,
    );
  });
});
