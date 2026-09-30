import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsEngineContractAcceptance } from "./engineContractAcceptance.ts";

describe("needsEngineContractAcceptance", () => {
  it("requires acceptance when missing", () => {
    assert.equal(needsEngineContractAcceptance(undefined, "abc", "1"), true);
  });

  it("requires again when fingerprint changes", () => {
    assert.equal(
      needsEngineContractAcceptance(
        { textFingerprint: "old", acceptedAt: "t", textVersion: "1" },
        "new",
        "1",
      ),
      true,
    );
  });

  it("accepts when fingerprint and version match", () => {
    assert.equal(
      needsEngineContractAcceptance(
        { textFingerprint: "fp", acceptedAt: "t", textVersion: "2" },
        "fp",
        "2",
      ),
      false,
    );
  });
});
