import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

const ROOT = path.resolve("docs/design/separation-export-a11y/captures-react");

describe("B1 mutation proof artifact (#196)", () => {
  it("script et log prouvent l’échec legacy pour débordement pied", () => {
    const script = readFileSync(path.join(ROOT, "b1-regression-old-popin.mts"), "utf8");
    assert.match(script, /LEGACY_SHA = "92f4f8a"/);
    assert.match(script, /footerReach/);
    assert.match(script, /process\.exitCode = 1/);
    const logPath = path.join(ROOT, "B1-regression-old-anchored-popin.txt");
    assert.equal(existsSync(logPath), true);
    const log = readFileSync(logPath, "utf8");
    assert.match(log, /FAIL attendu \(legacy\)/);
    assert.match(log, /"reachable": false/);
    assert.doesNotMatch(log, /PASS inattendu/);
  });
});
