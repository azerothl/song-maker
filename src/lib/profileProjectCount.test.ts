import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProfileProjectCount } from "./profileProjectCount.ts";

describe("formatProfileProjectCount (#210)", () => {
  it("french singular and plural", () => {
    assert.equal(formatProfileProjectCount(0), "aucun morceau");
    assert.equal(formatProfileProjectCount(1), "1 morceau");
    assert.equal(formatProfileProjectCount(12), "12 morceaux");
  });
});
