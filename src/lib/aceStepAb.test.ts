import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickEngineAbPair } from "./aceStepAb.ts";
import type { GenerationSummary } from "./types.ts";

function gen(
  partial: Partial<GenerationSummary> & Pick<GenerationSummary, "id">,
): GenerationSummary {
  return {
    createdAt: "2026-10-01",
    seed: 1,
    cot: "full",
    state: "generated",
    hasScore: false,
    canContinue: false,
    audioPath: `/tmp/${partial.id}.wav`,
    ...partial,
  };
}

describe("ACE-Step A/B pair (#341)", () => {
  it("picks the latest YuE2 and ACE-Step takes with audio", () => {
    const pair = pickEngineAbPair([
      gen({ id: "y1", engineId: "yue2_3b" }),
      gen({ id: "a1", engineId: "ace_step_1_5" }),
      gen({ id: "y2", engineId: "yue2_3b" }),
      gen({ id: "missing", engineId: "ace_step_1_5", audioPath: null }),
    ]);
    assert.ok(pair);
    assert.equal(pair.yue2.id, "y2");
    assert.equal(pair.aceStep.id, "a1");
  });

  it("returns null until both engines have a generated wav", () => {
    assert.equal(
      pickEngineAbPair([gen({ id: "y1", engineId: "yue2_3b" })]),
      null,
    );
  });
});
