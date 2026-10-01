import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatProfileMigrationBannerEn,
  formatProfileMigrationBannerFr,
  pickProfileMigrationBannerProfile,
  PROFILE_MAX_COUNT_DEFAULT,
} from "./profileMigrationBannerCopy.ts";
import type { ProfileSummary } from "./profilesTypes.ts";

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

  it("picks migrated hobby profile name for banner title", () => {
    const hobby: ProfileSummary = {
      id: "profile-001",
      name: "Profil Hobby (vos projets existants)",
      kind: "hobby",
      projectCount: 12,
      acceptedContractCount: 3,
      isLastUsed: true,
      isActive: true,
    };
    const picked = pickProfileMigrationBannerProfile([hobby]);
    assert.equal(picked?.name, "Profil Hobby (vos projets existants)");
  });

  it("does not match decoy names that merely include Profil Hobby", () => {
    const decoy: ProfileSummary = {
      id: "decoy",
      name: "Profil Hobby remix",
      kind: "hobby",
      projectCount: 0,
      acceptedContractCount: 0,
      isLastUsed: false,
      isActive: false,
    };
    const fallback: ProfileSummary = {
      id: "other",
      name: "Studio",
      kind: "hobby",
      projectCount: 1,
      acceptedContractCount: 0,
      isLastUsed: true,
      isActive: true,
    };
    assert.equal(pickProfileMigrationBannerProfile([decoy, fallback])?.id, "other");
  });

  it("english body copy is wired for migration banner", () => {
    const text = formatProfileMigrationBannerEn(12, MAX);
    assert.match(text, /Your 12 songs/);
    assert.match(text, /up to 6/);
  });
});
