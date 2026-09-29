import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MixTrack } from "./types";
import {
  buildTrackFamilyGroups,
  isExperimentalStemTrack,
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
