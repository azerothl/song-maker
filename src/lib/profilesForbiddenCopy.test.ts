import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fr from "../ui/fr.json";
import enProfiles from "../ui/en.profiles.json";
import {
  COMMERCIAL_COPY_FORBIDDEN,
  COMMERCIAL_CREATE_CONFIRM_INTRO_FR,
  COMMERCIAL_CREATE_CONFIRM_TITLE_FR,
  COMMERCIAL_CREATION_DISABLED_REASON_FR,
  COMMERCIAL_PROFILE_DESCRIPTION_FR,
  COMMERCIAL_GRAY_REASONS_FR,
} from "@song-maker/stem-providers";

const FORBIDDEN = COMMERCIAL_COPY_FORBIDDEN;

function profileStrings(): string[] {
  const keys = Object.keys(fr).filter((k) => k.startsWith("profiles."));
  const fromFr = keys.map((k) => String(fr[k as keyof typeof fr]));
  const fromEn = Object.keys(enProfiles).map(
    (k) => enProfiles[k as keyof typeof enProfiles],
  );
  return [
    ...fromFr,
    ...fromEn,
    COMMERCIAL_PROFILE_DESCRIPTION_FR,
    COMMERCIAL_CREATION_DISABLED_REASON_FR,
    COMMERCIAL_CREATE_CONFIRM_TITLE_FR,
    COMMERCIAL_CREATE_CONFIRM_INTRO_FR,
    ...Object.values(COMMERCIAL_GRAY_REASONS_FR),
  ];
}

describe("profiles commercial copy forbidden words (#201)", () => {
  it("no sûr / garanti / libre de droits in profile UI strings", () => {
    for (const text of profileStrings()) {
      assert.equal(FORBIDDEN.test(text), false, `forbidden word in: ${text}`);
    }
  });
});
