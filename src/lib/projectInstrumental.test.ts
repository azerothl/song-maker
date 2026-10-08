import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planProjectInstrumentalPart } from "./projectInstrumental.ts";

describe("planProjectInstrumentalPart", () => {
  it("refuses mix/stems on YuE2 and when Lego is not installed", () => {
    const plan = planProjectInstrumentalPart({
      role: "bass",
      conditioning: "mix_stems",
      style: "funk",
      hasMixOrStems: true,
    });
    assert.equal(plan.ok, false);
    if (!plan.ok) {
      assert.match(plan.messageFr, /Lego|audio_input|YuE2/);
      assert.doesNotMatch(plan.messageFr, /silencieusement/);
    }
  });

  it("plans Lego add-track when the sidecar is ready, with fused-mix honesty", () => {
    const plan = planProjectInstrumentalPart({
      role: "drums",
      conditioning: "mix_stems",
      style: "funk",
      tempoBpm: 100,
      hasMixOrStems: true,
      legoSidecarReady: true,
      legoLicenseAccepted: true,
    });
    assert.equal(plan.ok, true);
    if (plan.ok && plan.conditioning === "mix_stems") {
      assert.equal(plan.engine, "ace_step_lego");
      assert.equal(plan.outputKind, "possibly_fused_mix");
      assert.match(plan.leftoverNotesFr, /morceau d’origine/);
      assert.match(plan.leftoverNotesFr, /doublés/);
      assert.doesNotMatch(plan.leftoverNotesFr, /start_ms|follow_project_tempo|stem dry/);
      assert.match(plan.styleSent, /100 BPM/);
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
    if (plan.ok && plan.conditioning === "project_metadata") {
      assert.equal(plan.instrumentalMode, true);
      assert.equal(plan.engine, "yue2");
      assert.equal(plan.displayName, "Basse");
      assert.match(plan.styleSent, /funk/);
      assert.match(plan.styleSent, /96 BPM/);
      assert.match(plan.styleSent, /E minor/);
    }
  });
});
