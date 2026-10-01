import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("profile focus restore (#212)", () => {
  it("switch confirm stays mounted with open prop so focus can return to trigger", () => {
    const selector = readSrc("src/components/ProfileSelector.tsx");
    const dialog = readSrc("src/components/ProfileSwitchConfirmDialog.tsx");
    assert.match(selector, /open=\{pending !== null\}/);
    assert.match(selector, /returnFocusRef=\{triggerRef\}/);
    assert.match(dialog, /returnFocusRef/);
    assert.match(dialog, /wasOpenRef/);
    assert.match(dialog, /focusProfileElement\(restore\)/);
  });

  it("onboarding rename stays mounted with open prop and returnFocusRef", () => {
    const onboarding = readSrc("src/screens/ProfileOnboardingScreen.tsx");
    assert.match(onboarding, /open=\{renaming !== null\}/);
    assert.match(onboarding, /returnFocusRef=\{renameTriggerRef\}/);
    assert.doesNotMatch(
      onboarding,
      /\{renaming \? \(\s*<ProfileRenameDialog/,
    );
  });

  it("rename dialog keeps a11y error affordances and max length", () => {
    const rename = readSrc("src/components/ProfileRenameDialog.tsx");
    assert.match(rename, /maxLength=\{PROFILE_NAME_MAX_LENGTH\}/);
    assert.match(rename, /role="alert"/);
    assert.match(rename, /aria-invalid/);
    assert.match(rename, /returnFocusRef/);
    assert.match(rename, /wasOpenRef/);
    assert.match(rename, /focusProfileElement\(restore\)/);
  });
});
