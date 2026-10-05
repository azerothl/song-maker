import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fr from "../ui/fr.json";
import enApp from "../ui/en.app.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("batch generation (#368)", () => {
  it("starts the reviewed token without silently recalculating its plan", () => {
    const panel = readFileSync(join(root, "src/components/BatchGenerationPanel.tsx"), "utf8");
    const launch = panel.slice(panel.indexOf("async function onLaunch()"), panel.indexOf("async function onVerifyParallelism()"));
    assert.doesNotMatch(launch, /updateBatchPreview/);
    assert.match(launch, /if \(!preview \|\| previewDirty\) return/);
    assert.match(launch, /startBatch\(preview.startToken, preview.revision\)/);
    assert.match(panel, /disabled=\{busy \|\| previewDirty \|\| !preview.canLaunch\}/);
    assert.ok("batch.refreshRequired" in fr);
    assert.ok("batch.refreshRequired" in enApp);
  });
  it("admits GPU capacity 1 and keeps the example at 5 tasks", () => {
    const rust = readFileSync(join(root, "src-tauri/src/batch.rs"), "utf8");
    assert.match(rust, /pub const ADMITTED_PARALLEL: u32 = 1;/);
    assert.match(rust, /allowReduction/);
    assert.match(rust, /requireRequested/);
    const example = JSON.parse(
      readFileSync(join(root, "docs/batch-generation/example.batch.json"), "utf8"),
    );
    assert.equal(example.songs.length, 2);
    assert.equal(example.defaults.generations, 3);
    assert.equal(example.songs[1].generations, 2);
  });

  it("exposes Library import UI and does not claim overlapping GPU workers", () => {
    const screen = readFileSync(join(root, "src/screens/LibraryScreen.tsx"), "utf8");
    const panel = readFileSync(
      join(root, "src/components/BatchGenerationPanel.tsx"),
      "utf8",
    );
    assert.match(screen, /BatchGenerationPanel/);
    assert.match(panel, /batch\.honest/);
    assert.doesNotMatch(panel, /deux inférences se chevauchent/);
    assert.equal(fr["batch.honest"].includes("simultanéité"), false);
    assert.doesNotMatch(panel, /preview\.capacityReasonFr|batch\.capacityReasonFr|result\.messageFr|preview\.launchBlockFr/);
    for (const key of ["batch.capacityAvailable", "batch.capacityReduced", "batch.launchBlocked", "batch.verifySucceeded", "batch.verifyFailed"]) {
      assert.ok(key in fr);
      assert.ok(key in enApp);
    }
    assert.ok("batch.open" in enApp);
    assert.doesNotMatch(fr["candidates.foldSummary"], /parallèle/i);
    assert.doesNotMatch(enApp["candidates.foldSummary"], /parallel/i);
  });
});
