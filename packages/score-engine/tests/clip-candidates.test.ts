import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCandidateComparer,
  createClipEditor,
  createStopAfterAbcClient,
  STOP_AFTER_ABC_ENABLED,
  ScoreEngineError,
  type Clip,
} from "../src/index.js";

function sampleClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    trackId: "trk-vocals",
    sourcePath: "separations/sep-001/vocals-48000.wav",
    sourceSha256: "abc",
    startMs: 0,
    offsetMs: 0,
    durationMs: 10_000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe("clip editor", () => {
  const editor = createClipEditor();

  it("applique fade / move / trim / duplicate", () => {
    let clips = [sampleClip()];
    clips = editor.apply(clips, {
      kind: "fade",
      clipId: "c1",
      fadeInMs: 500,
      fadeOutMs: 1000,
    });
    assert.equal(clips[0]!.fadeInMs, 500);
    assert.equal(clips[0]!.fadeOutMs, 1000);

    clips = editor.apply(clips, { kind: "move", clipId: "c1", startMs: 2000 });
    assert.equal(clips[0]!.startMs, 2000);

    clips = editor.apply(clips, {
      kind: "trim",
      clipId: "c1",
      offsetMs: 1000,
      durationMs: 4000,
    });
    assert.equal(clips[0]!.offsetMs, 1000);
    assert.equal(clips[0]!.durationMs, 4000);
    // fadeOut was 1000, still fits
    assert.equal(clips[0]!.fadeOutMs, 1000);

    clips = editor.apply(clips, {
      kind: "duplicate",
      clipId: "c1",
      startMs: 8000,
    });
    assert.equal(clips.length, 2);
    assert.notEqual(clips[1]!.id, "c1");
    assert.equal(clips[1]!.startMs, 8000);
    assert.equal(clips[1]!.sourcePath, clips[0]!.sourcePath);
  });

  it("coupe un clip en deux", () => {
    const clips = editor.apply([sampleClip({ startMs: 1000, durationMs: 5000 })], {
      kind: "cut",
      clipId: "c1",
      atMs: 3000,
    });
    assert.equal(clips.length, 2);
    assert.equal(clips[0]!.durationMs, 2000);
    assert.equal(clips[1]!.startMs, 3000);
    assert.equal(clips[1]!.offsetMs, 2000);
    assert.equal(clips[1]!.durationMs, 3000);
  });

  it("refuse un fondu trop long", () => {
    assert.throws(
      () =>
        editor.apply([sampleClip({ durationMs: 500 })], {
          kind: "fade",
          clipId: "c1",
          fadeInMs: 400,
          fadeOutMs: 200,
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "validation_failed",
    );
  });
});

describe("comparateur multi-candidats", () => {
  it("ouvre sans gagnant automatique", () => {
    const cmp = createCandidateComparer();
    const view = cmp.openCompare([
      {
        id: "a",
        generationFolder: "gen-001",
        seed: 1,
        createdAt: "2026-09-26T00:00:00Z",
        audioPath: "a.wav",
        scoreAbcPath: null,
      },
      {
        id: "b",
        generationFolder: "gen-002",
        seed: 2,
        createdAt: "2026-09-26T00:01:00Z",
        audioPath: "b.wav",
        scoreAbcPath: null,
      },
    ]);
    assert.equal(view.selectedId, null);
    assert.equal(cmp.select(view, "b").selectedId, "b");
  });
});

describe("stop_after=abc gate", () => {
  it("reste gated hors épingle ≥ 0.8.2", async () => {
    assert.equal(STOP_AFTER_ABC_ENABLED, false);
    const client = createStopAfterAbcClient();
    assert.equal(client.isEnabled(), false);
    await assert.rejects(
      () =>
        client.run({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "full",
          seed: 1,
          stopAfter: "abc",
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "not_implemented",
    );
  });

  it("refuse cot=off et ABC externe", async () => {
    const client = createStopAfterAbcClient();
    await assert.rejects(
      () =>
        client.run({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "off",
          seed: 1,
          stopAfter: "abc",
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "abc_with_cot_off",
    );
    await assert.rejects(
      () =>
        client.run({
          style: "pop",
          lyrics: "[Verse]\nHi",
          cot: "full",
          seed: 1,
          stopAfter: "abc",
          abcPath: "x.abc",
        }),
      (err: unknown) =>
        err instanceof ScoreEngineError && err.code === "validation_failed",
    );
  });
});
