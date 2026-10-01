import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { candidateGenerateLabel } from "./candidateLabels.ts";

describe("candidateGenerateLabel", () => {
  it("utilise le singulier pour 1 candidat", () => {
    assert.equal(candidateGenerateLabel(1), "Générer 1 candidat");
  });

  it("affiche le nombre choisi au pluriel", () => {
    assert.equal(candidateGenerateLabel(2), "Générer 2 candidats");
    assert.equal(candidateGenerateLabel(4), "Générer 4 candidats");
  });
});
