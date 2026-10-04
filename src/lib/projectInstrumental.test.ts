import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planProjectInstrumentalPart } from "./projectInstrumental.ts";

describe("planProjectInstrumentalPart", () => {
  it("refuses mix/stems conditioning while YuE2 has no audio_input", () => {
    const plan = planProjectInstrumentalPart({
      role: "bass",
      conditioning: "mix_stems",
      style: "funk",
      hasMixOrStems: true,
    });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.match(plan.messageFr, /audio_input/);
      assert.match(plan.messageFr, /stems/);
    }
  });

  it("plans a metadata-conditioned instrumental track for the open project", () => {
    const plan = planProjectInstrumentalPart({
      role: "bass",
      conditioning: "project_metadata",
      style: "funk",
      tempoBpm: 96,
      key: { tonic: "E", mode: "minor" },
      hasMixOrStems: true,
    });
    assert.equal(plan.ok, true);
    if (plan.ok) {
      assert.equal(plan.instrumentalMode, true);
      assert.equal(plan.displayName, "Basse");
      assert.match(plan.styleSent, /funk/);
      assert.match(plan.styleSent, /96 BPM/);
      assert.match(plan.styleSent, /E minor/);
    }
  });
});
