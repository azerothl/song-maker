import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { separationAudioDurationSec } from "./separationDuration";

describe("separationAudioDurationSec (#166)", () => {
  it("utilise la durée mesurée des sources, pas 180 par défaut", () => {
    const sec = separationAudioDurationSec({
      project: { targetDurationSec: 180 } as never,
      mix: null,
      playbackSources: null,
      sourceDurationMsByTrack: { vocals: 42_000 },
    });
    assert.equal(sec, 42);
  });
});
