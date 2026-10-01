import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLongReferenceScoreDocument,
  buildReferenceScoreDocument,
  referenceScoreStats,
} from "./referenceScoreDocument.ts";
import { buildStaffAbc } from "../lib/staffAbc.ts";

describe("reference score bench fixture", () => {
  it("représente une partition longue réaliste pour le bench", () => {
    const doc = buildReferenceScoreDocument();
    const stats = referenceScoreStats(doc);
    assert.ok(stats.noteCount >= 700);
    assert.ok(stats.maxTick >= 400_000);
    assert.ok(stats.pianoRollWidthPx >= 15_000);

    const staff = buildStaffAbc(doc, "Bench");
    assert.equal(staff.ok, true);
    if (staff.ok) {
      const lines = staff.abc.split("\n").length;
      assert.ok(lines >= 100, `ABC trop court: ${lines} lignes`);
    }
  });

  it("fournit une variante longue pour le bench (~8× mesures)", () => {
    const ref = referenceScoreStats(buildReferenceScoreDocument());
    const long = referenceScoreStats(buildLongReferenceScoreDocument());
    assert.ok(long.noteCount > ref.noteCount * 6);
    const staff = buildStaffAbc(buildLongReferenceScoreDocument(), "Long");
    assert.equal(staff.ok, true);
    if (staff.ok) {
      assert.ok(staff.abc.length > 20_000);
    }
  });
});
