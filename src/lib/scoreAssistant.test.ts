import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyScoreFix, suggestFixesFromIssues } from "./scoreAssistant.ts";
import type { ScoreDocument } from "./score.ts";

const doc: ScoreDocument = {
  id: "t",
  version: 1,
  ppq: 960 as const,
  tempoMap: [],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  keySignatures: [{ tick: 0, tonic: "C", mode: "major" }],
  sections: [],
  voices: [
    {
      id: "v1",
      name: "Vocal",
      role: "vocal",
      abcVoice: "Vocal",
      notes: [
        {
          id: "n1",
          startTick: 10,
          durationTick: 470,
          pitch: 90,
          velocity: 80,
        },
      ],
    },
  ],
  chordEvents: [],
  lyricAnchors: [],
  source: "manual",
};

describe("scoreAssistant", () => {
  it("suggests quantize for unaligned durations", () => {
    const tips = suggestFixesFromIssues([
      {
        code: "unaligned_duration",
        severity: "error",
        message: "durée non alignée",
      },
    ]);
    assert.equal(tips[0]?.actionId, "quantize_120");
    assert.equal(tips[0]?.autoApplicable, true);
  });

  it("applies pitch clamp", () => {
    const result = applyScoreFix(doc, "clamp_pitches");
    assert.ok(result);
    assert.equal(result.document.voices[0]?.notes[0]?.pitch, 84);
  });

  it("applies tempo when missing", () => {
    const result = applyScoreFix(doc, "add_tempo");
    assert.ok(result);
    assert.equal(result.document.tempoMap[0]?.quarterBpm, 120);
  });
});
