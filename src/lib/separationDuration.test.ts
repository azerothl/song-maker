import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { separationAudioDurationSec } from "./separationDuration";

describe("separationAudioDurationSec (#166)", () => {
  it("utilise la durée mesurée des sources, pas 180 par défaut", () => {
    const sec = separationAudioDurationSec({
      project: { targetDurationSec: 180 } as never,
      mix: null,
      sourceDurationMsByTrack: { vocals: 42_000 },
    });
    assert.equal(sec, 42);
  });

  it("préfère la durée de lecture réelle avant targetDurationSec", () => {
    const sec = separationAudioDurationSec({
      project: { targetDurationSec: 180 } as never,
      mix: null,
      playbackDurationSec: 97.5,
      sourceDurationMsByTrack: {},
    });
    assert.equal(sec, 97.5);
  });

  it("retombe sur targetDurationSec seulement en dernier recours", () => {
    const sec = separationAudioDurationSec({
      project: { targetDurationSec: 120 } as never,
      mix: null,
      sourceDurationMsByTrack: {},
    });
    assert.equal(sec, 120);
  });
});
