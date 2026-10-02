import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultEffectParams,
  isPitchCorrectEligibleTrack,
  isVocalEffectEligibleTrack,
  UI_EFFECT_KINDS,
} from "./productionState.ts";

describe("voice FX eligibility (#164)", () => {
  it("autorise vocals / vocal / *vocal*", () => {
    assert.equal(isVocalEffectEligibleTrack("vocals"), true);
    assert.equal(isVocalEffectEligibleTrack("Vocal"), true);
    assert.equal(isVocalEffectEligibleTrack("lead-vocal"), true);
    assert.equal(isVocalEffectEligibleTrack("drums"), false);
    assert.equal(isPitchCorrectEligibleTrack("vocals"), true);
  });

  it("expose voice_cleanup et voice_convert dans UI_EFFECT_KINDS", () => {
    assert.ok(UI_EFFECT_KINDS.includes("voice_cleanup"));
    assert.ok(UI_EFFECT_KINDS.includes("voice_convert"));
    assert.ok(UI_EFFECT_KINDS.includes("pitch_correct"));
  });

  it("fournit des paramètres par défaut cohérents", () => {
    const cleanup = defaultEffectParams("voice_cleanup");
    assert.equal(cleanup.strength, 0.55);
    assert.equal(cleanup.noiseFloorDb, -48);
    assert.equal(cleanup.preserveAttack, 0.65);
    const convert = defaultEffectParams("voice_convert");
    assert.equal(convert.consentOwnVoice, false);
  });
});
