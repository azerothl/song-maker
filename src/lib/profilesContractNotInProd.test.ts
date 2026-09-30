import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkProdSources(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "dev") continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walkProdSources(path, out);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    if (name.includes(".test.")) continue;
    out.push(path);
  }
}

describe("engine contract template not rendered in production UI (#201 lot 1)", () => {
  it("no prod source references contract body placeholder", () => {
    const files: string[] = [];
    walkProdSources(SRC, files);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(
        text.includes("ENGINE_CONTRACT_BODY"),
        false,
        `contract export in ${file}`,
      );
      assert.equal(
        text.includes("[citation ci-dessous]"),
        false,
        `contract placeholder in ${file}`,
      );
    }
  });
});
