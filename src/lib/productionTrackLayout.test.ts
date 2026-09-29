import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MixTrack } from "./types";
import {
  buildTrackFamilyGroups,
  effectiveDensityFromPreference,
  isExperimentalStemTrack,
  MIN_KNOB_VERTICAL_MARGIN_PX,
  productionListFitsInScroll,
  shouldUseCompactForAutoDensity,
  shouldUseProductionTightLayout,
  trackFamilyForRole,
} from "./productionTrackLayout";

function tr(id: string, role: string): MixTrack {
  return {
    id,
    role,
    name: id,
    gainDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    locked: false,
    aiSeparated: true,
    clips: [],
  };
}

describe("trackFamilyForRole", () => {
  it("classe voix, rythmique et harmonie", () => {
    assert.equal(trackFamilyForRole("vocals"), "voix");
    assert.equal(trackFamilyForRole("drums"), "rythmique");
    assert.equal(trackFamilyForRole("guitar"), "harmonie");
    assert.equal(trackFamilyForRole("user"), "harmonie");
  });
});

describe("buildTrackFamilyGroups", () => {
  it("conserve l’ordre du mix dans chaque famille", () => {
    const tracks = [
      tr("a", "drums"),
      tr("b", "vocals"),
      tr("c", "bass"),
      tr("d", "piano"),
    ];
    const groups = buildTrackFamilyGroups(tracks);
    assert.deepEqual(
      groups.map((g) => g.family),
      ["voix", "rythmique", "harmonie"],
    );
    assert.deepEqual(groups[0]!.tracks.map((t) => t.id), ["b"]);
    assert.deepEqual(groups[1]!.tracks.map((t) => t.id), ["a", "c"]);
    assert.deepEqual(groups[2]!.tracks.map((t) => t.id), ["d"]);
  });
});

describe("shouldUseProductionTightLayout", () => {
  it("active en vue mix (toutes densités)", () => {
    assert.equal(shouldUseProductionTightLayout("mix", "compact"), true);
    assert.equal(shouldUseProductionTightLayout("mix", "confortable"), true);
    assert.equal(shouldUseProductionTightLayout("clips", "compact"), false);
  });
});

describe("effectiveDensityFromPreference", () => {
  it("respecte le choix manuel et résout Auto", () => {
    assert.equal(effectiveDensityFromPreference("compact", "confortable"), "compact");
    assert.equal(effectiveDensityFromPreference("confortable", "compact"), "confortable");
    assert.equal(effectiveDensityFromPreference("auto", "compact"), "compact");
    assert.equal(effectiveDensityFromPreference("auto", "confortable"), "confortable");
  });
});

describe("shouldUseCompactForAutoDensity", () => {
  it("bascule en compact seulement si scrollHeight > clientHeight (strict)", () => {
    assert.equal(shouldUseCompactForAutoDensity(500, 400), true);
    assert.equal(shouldUseCompactForAutoDensity(400, 400), false);
    assert.equal(shouldUseCompactForAutoDensity(486, 486), false);
    assert.equal(shouldUseCompactForAutoDensity(487, 486), true);
  });
});

describe("productionListFitsInScroll", () => {
  it("exige scrollHeight <= clientHeight", () => {
    assert.equal(productionListFitsInScroll(486, 486), true);
    assert.equal(productionListFitsInScroll(488, 486), false);
  });
});

describe("MIN_KNOB_VERTICAL_MARGIN_PX", () => {
  it("fixe le seuil d’acceptation des marges potards", () => {
    assert.equal(MIN_KNOB_VERTICAL_MARGIN_PX, 3.5);
  });
});

describe("isExperimentalStemTrack", () => {
  it("marque guitare et piano IA", () => {
    assert.equal(isExperimentalStemTrack(tr("g", "guitar")), true);
    assert.equal(isExperimentalStemTrack(tr("v", "vocals")), false);
    assert.equal(
      isExperimentalStemTrack({ ...tr("p", "piano"), aiSeparated: false }),
      false,
    );
  });
});
