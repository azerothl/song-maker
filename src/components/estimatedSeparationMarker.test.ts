import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors SongScreen split-transport predicate (#132). */
function shouldDelegateTransport(
  workspace: string,
  playbackMode: string | undefined,
  hasAiStems: boolean,
): boolean {
  return (
    workspace === "production" &&
    playbackMode === "stems" &&
    hasAiStems
  );
}

describe("shouldDelegateTransport", () => {
  it("active en production avec stems IA", () => {
    assert.equal(shouldDelegateTransport("production", "stems", true), true);
  });

  it("inactif sans stems ou hors production", () => {
    assert.equal(shouldDelegateTransport("score", "stems", true), false);
    assert.equal(shouldDelegateTransport("production", "generation", true), false);
    assert.equal(shouldDelegateTransport("production", "stems", false), false);
  });
});
