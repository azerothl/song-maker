import assert from "node:assert/strict";
import { it } from "node:test";
import { createClipEditor, type Clip } from "@song-maker/score-engine";
import { createdClipId } from "./createdClipSelection";

const clip = (id: string, startMs: number): Clip => ({
  id, startMs, trackId: "track", sourcePath: "audio.wav", sourceSha256: "sha",
  offsetMs: 100, durationMs: 1000, gainDb: -3, fadeInMs: 50, fadeOutMs: 100,
  timeStretchRatio: 1.2,
});

it("splitting the first of three clips selects its new right half", () => {
  const before = [clip("a", 0), clip("b", 2000), clip("c", 4000)];
  const operation = { kind: "cut" as const, clipId: "a", atMs: 500 };
  const after = createClipEditor().apply(before, operation);
  const selected = after.find(c => c.id === createdClipId(before, after, operation));
  assert.equal(selected?.startMs, 500);
  // A 500 ms timeline split consumes 417 ms of the stretched source.
  assert.equal(selected?.offsetMs, 517);
  assert.equal(selected?.timeStretchRatio, 1.2);
  assert.deepEqual(after.filter(c => c.id === "b" || c.id === "c"), before.slice(1));
  assert.notEqual(selected?.id, "c");
});

it("duplication selects the new copy even when it is inserted earlier", () => {
  const before = [clip("a", 2000), clip("b", 4000)];
  const operation = { kind: "duplicate" as const, clipId: "a", startMs: 0 };
  const after = createClipEditor().apply(before, operation);
  assert.equal(after.find(c => c.id === createdClipId(before, after, operation))?.startMs, 0);
});
