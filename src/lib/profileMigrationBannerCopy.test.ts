import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatProfileMigrationBannerEn,
  formatProfileMigrationBannerFr,
  PROFILE_MAX_COUNT_DEFAULT,
} from "./profileMigrationBannerCopy.ts";

const MAX = PROFILE_MAX_COUNT_DEFAULT;

describe("profileMigrationBannerCopy (#210)", () => {
  it("french: 12 morceaux", () => {
    const text = formatProfileMigrationBannerFr(12, MAX);
    assert.equal(
      text,
      "Vos 12 morceaux et vos contrats déjà acceptés sont conservés dans ce profil. Vous pouvez le renommer ou en créer d'autres (6 au maximum).",
    );
    assert.doesNotMatch(text, /case à cocher/i);
  });

  it("french: 1 morceau", () => {
    const text = formatProfileMigrationBannerFr(1, MAX);
    assert.equal(
      text,
      "Votre morceau et vos contrats déjà acceptés sont conservés dans ce profil. Vous pouvez le renommer ou en créer d'autres (6 au maximum).",
    );
    assert.doesNotMatch(text, /\b1 morceau\b/);
    assert.doesNotMatch(text, /0 morceau/i);
  });

  it("french: 0 morceaux (sans mention du nombre)", () => {
    const text = formatProfileMigrationBannerFr(0, MAX);
    assert.equal(
      text,
      "Vos contrats déjà acceptés sont conservés dans ce profil. Vous pouvez le renommer ou en créer d'autres (6 au maximum).",
    );
    assert.doesNotMatch(text, /morceau/i);
  });

  it("english: 12 songs", () => {
    const text = formatProfileMigrationBannerEn(12, MAX);
    assert.equal(
      text,
      "Your 12 songs and your previously accepted agreements are kept in this profile. You can rename it or create others (up to 6).",
    );
  });

  it("english: 1 song", () => {
    const text = formatProfileMigrationBannerEn(1, MAX);
    assert.equal(
      text,
      "Your song and your previously accepted agreements are kept in this profile. You can rename it or create others (up to 6).",
    );
    assert.doesNotMatch(text, /\b1 songs\b/);
  });

  it("english: 0 songs (no count)", () => {
    const text = formatProfileMigrationBannerEn(0, MAX);
    assert.equal(
      text,
      "Your previously accepted agreements are kept in this profile. You can rename it or create others (up to 6).",
    );
    assert.doesNotMatch(text, /\bsong/i);
  });

  it("uses maxProfiles from state in tail", () => {
    assert.match(formatProfileMigrationBannerFr(2, 8), /\(8 au maximum\)\.$/);
    assert.match(formatProfileMigrationBannerEn(2, 8), /\(up to 8\)\.$/);
  });
});
