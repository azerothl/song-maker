import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profileSwitchBlockReason } from "./profileSwitchBlock.ts";

describe("profileSwitchBlockReason", () => {
  it("blocks during export busy", () => {
    const r = profileSwitchBlockReason({ state: "idle", label: "" }, true);
    assert.equal(r.blocked, true);
    if (r.blocked) assert.equal(r.kind, "export");
  });

  it("blocks during generation states", () => {
    for (const state of ["queued", "preparing", "generating"]) {
      const r = profileSwitchBlockReason({ state, label: "x" }, false);
      assert.equal(r.blocked, true);
      if (r.blocked) assert.equal(r.kind, "generation");
    }
  });

  it("blocks during separation states", () => {
    for (const state of ["separating", "importing_tracks"]) {
      const r = profileSwitchBlockReason({ state, label: "x" }, false);
      assert.equal(r.blocked, true);
      if (r.blocked) assert.equal(r.kind, "separation");
    }
  });

  it("allows when idle and not exporting", () => {
    assert.equal(profileSwitchBlockReason(null, false).blocked, false);
    assert.equal(
      profileSwitchBlockReason({ state: "idle", label: "" }, false).blocked,
      false,
    );
  });

  it("does not block on terminal queue states (generated banner gap)", () => {
    assert.equal(
      profileSwitchBlockReason({ state: "generated", label: "done" }, false)
        .blocked,
      false,
    );
  });
});
