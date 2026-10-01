import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProfileContractCount } from "./profileContractCount.ts";

describe("formatProfileContractCount (#237)", () => {
  it("uses singular for one accepted agreement", () => {
    assert.equal(formatProfileContractCount(1), "1 contrat accepté");
  });

  it("uses plural for several accepted agreements", () => {
    assert.equal(formatProfileContractCount(2), "2 contrats acceptés");
  });

  it("uses none copy for zero", () => {
    assert.equal(formatProfileContractCount(0), "aucun contrat accepté");
  });
});
