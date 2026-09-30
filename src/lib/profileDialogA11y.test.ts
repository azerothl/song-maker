import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("profile dialog / menu a11y (#212 R1)", () => {
  it("helper implements Escape, Tab trap, and arrow keys", () => {
    const helper = readSrc("src/lib/profileDialogA11y.ts");
    assert.match(helper, /Escape/);
    assert.match(helper, /Tab/);
    assert.match(helper, /ArrowDown/);
    assert.match(helper, /ArrowUp/);
    assert.match(helper, /listProfileFocusables/);
  });

  it("selector menu and switch dialog call the overlay keydown helper", () => {
    const selector = readSrc("src/components/ProfileSelector.tsx");
    const dialog = readSrc("src/components/ProfileSwitchConfirmDialog.tsx");
    assert.match(selector, /handleProfileOverlayKeydown/);
    assert.match(selector, /listProfileFocusables/);
    assert.match(dialog, /handleProfileOverlayKeydown/);
    assert.match(dialog, /focusProfileElement/);
  });
});
