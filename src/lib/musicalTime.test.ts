import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ARRANGEMENT_BPM,
  ensureMixArrangement,
  formatMusical,
  msToMusical,
  musicalToMs,
  removeMixMarker,
  shiftClipsFromMs,
  snapMs,
  upsertMixMarker,
  upsertTempoEvent,
} from "./musicalTime.ts";
import type { MixDoc } from "./types.ts";

function sampleMix(partial?: Partial<MixDoc>): MixDoc {
  return {
    schema: "songmaker.mix",
    schemaVersion: 1,
    id: "mix-v001",
    separationId: "sep-001",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [
      {
        id: "trk-vocals",
        role: "vocals",
        name: "Voix",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [
          {
            id: "clip-1",
            trackId: "trk-vocals",
            sourcePath: "vocals.wav",
            sourceSha256: "abc",
            startMs: 2000,
            offsetMs: 100,
            durationMs: 4000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        ],
      },
    ],
    ...partial,
  };
}

describe("musicalTime", () => {
  it("defaults legacy mixes to 120/4-4 without moving clips", () => {
    const mix = sampleMix();
    const next = ensureMixArrangement(mix);
    assert.equal(next.tempoMap?.[0]?.quarterBpm, DEFAULT_ARRANGEMENT_BPM);
    assert.equal(next.timeSignatures?.[0]?.numerator, 4);
    assert.equal(next.tracks[0]!.clips[0]!.startMs, 2000);
    assert.equal(next.tracks[0]!.clips[0]!.offsetMs, 100);
  });

  it("uses project tempo hint when mix has no map", () => {
    const next = ensureMixArrangement(sampleMix(), 90, {
      numerator: 3,
      denominator: 4,
    });
    assert.equal(next.tempoMap?.[0]?.quarterBpm, 90);
    assert.equal(next.timeSignatures?.[0]?.numerator, 3);
  });

  it("maps ms ↔ bars at 120 BPM 4/4", () => {
    const tempo = [{ startMs: 0, quarterBpm: 120 }];
    const meter = [{ startMs: 0, numerator: 4, denominator: 4 }];
    // 1 bar = 4 beats * 500 ms = 2000 ms
    assert.equal(musicalToMs(2, 1, 0, tempo, meter, 4), 2000);
    const pos = msToMusical(2000, tempo, meter, 4);
    assert.equal(pos.bar, 2);
    assert.equal(pos.beat, 1);
    assert.equal(formatMusical(pos), "2.1.0");
  });

  it("snaps to musical grid", () => {
    const tempo = [{ startMs: 0, quarterBpm: 120 }];
    const meter = [{ startMs: 0, numerator: 4, denominator: 4 }];
    const snapped = snapMs(510, {
      enabled: true,
      mode: "musical",
      tempoMap: tempo,
      meterMap: meter,
      subdivision: 1,
    });
    assert.equal(snapped, 500);
  });

  it("snaps to time grid when mode is time", () => {
    const snapped = snapMs(73, {
      enabled: true,
      mode: "time",
      tempoMap: [],
      meterMap: [],
      subdivision: 4,
      timeSnapMs: 50,
    });
    assert.equal(snapped, 50);
  });

  it("supports mid-song tempo without rewriting clip source offsets", () => {
    const mix = upsertTempoEvent(sampleMix(), {
      startMs: 4000,
      quarterBpm: 90,
    });
    assert.equal(mix.tempoMap?.length, 2);
    assert.equal(mix.tracks[0]!.clips[0]!.offsetMs, 100);
    const pos = msToMusical(4500, mix.tempoMap!, [
      { startMs: 0, numerator: 4, denominator: 4 },
    ]);
    assert.ok(pos.bar >= 1);
  });

  it("shifts clip startMs when moving a section, not offsetMs", () => {
    const mix = sampleMix();
    const shifted = shiftClipsFromMs(mix, 2000, 500);
    assert.equal(shifted.tracks[0]!.clips[0]!.startMs, 2500);
    assert.equal(shifted.tracks[0]!.clips[0]!.offsetMs, 100);
  });

  it("upserts and removes markers", () => {
    let mix = sampleMix();
    mix = upsertMixMarker(mix, {
      id: "mk-1",
      name: "Refrain",
      kind: "chorus",
      startMs: 8000,
    });
    assert.equal(mix.markers?.length, 1);
    mix = removeMixMarker(mix, "mk-1");
    assert.equal(mix.markers?.length, 0);
  });
});
