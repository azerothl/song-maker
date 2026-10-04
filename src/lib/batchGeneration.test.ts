import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fr from "../ui/fr.json";
import enApp from "../ui/en.app.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("batch generation (#368)", () => {
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
    assert.equal(
      fr["batch.honest"].includes("Capacité admise : 1"),
      true,
    );
    assert.ok("batch.open" in enApp);
  });
});
