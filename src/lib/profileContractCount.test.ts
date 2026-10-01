import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { formatProfileContractCount } from "./profileContractCount.ts";

describe("formatProfileContractCount (#237)", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  afterEach(() => {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  it("English: no agreement, one agreement, several agreements", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: () => "en" }, configurable: true,
    });
    assert.equal(formatProfileContractCount(0), "no accepted agreements");
    assert.equal(formatProfileContractCount(1), "1 accepted agreement");
    assert.equal(formatProfileContractCount(2), "2 accepted agreements");
  });
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
