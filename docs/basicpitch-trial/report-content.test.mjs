import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const reportPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "REPORT.md",
);

describe("REPORT.md BasicPitch (#169)", () => {
  it("mentionne données d’entraînement non vérifiées et avis non écouté", () => {
    const text = readFileSync(reportPath, "utf8");
    assert.match(text, /Données d’entraînement.*Non vérifiées/i);
    assert.match(text, /non écouté/i);
    assert.match(text, /quasi silence|quasi silencieux/i);
    assert.doesNotMatch(text, /cursor\/basicpitch-trial-ca11/);
    assert.doesNotMatch(text, /\*-original-8s\.wav/);
  });
});
