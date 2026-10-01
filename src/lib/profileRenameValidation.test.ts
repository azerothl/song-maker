import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_NAME_MAX_LENGTH,
  isProfileNameTooLong,
  profileNameCharCount,
  profileNamesCollide,
} from "./profileRenameValidation.ts";

describe("profile rename validation (#212)", () => {
  it("counts Unicode characters, not UTF-8 bytes", () => {
    const accented41 = "é".repeat(41);
    assert.equal(profileNameCharCount(accented41), 41);
    const utf8Bytes = new TextEncoder().encode(accented41).length;
    assert.ok(utf8Bytes > PROFILE_NAME_MAX_LENGTH);
    assert.ok(profileNameCharCount(accented41) <= PROFILE_NAME_MAX_LENGTH);
  });

  it("detects duplicate names with Unicode case folding", () => {
    assert.ok(profileNamesCollide("Été", "ÉTÉ"));
    assert.ok(!profileNamesCollide("Été", "Été 2"));
  });

  it("accepts 80 characters and rejects 81", () => {
    const ok = "x".repeat(PROFILE_NAME_MAX_LENGTH);
    const over = "x".repeat(PROFILE_NAME_MAX_LENGTH + 1);
    assert.equal(profileNameCharCount(ok), PROFILE_NAME_MAX_LENGTH);
    assert.ok(!isProfileNameTooLong(ok));
    assert.ok(isProfileNameTooLong(over));
  });
});
