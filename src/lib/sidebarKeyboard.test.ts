import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesSidebarToggleShortcut } from "./sidebarKeyboard";

describe("matchesSidebarToggleShortcut", () => {
  it("accepte Ctrl+B et ⌘+B", () => {
    assert.equal(
      matchesSidebarToggleShortcut({
        key: "b",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      true,
    );
    assert.equal(
      matchesSidebarToggleShortcut({
        key: "B",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
      }),
      true,
    );
  });

  it("refuse les modificateurs ou autres touches", () => {
    assert.equal(
      matchesSidebarToggleShortcut({
        key: "b",
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false,
      }),
      false,
    );
    assert.equal(
      matchesSidebarToggleShortcut({
        key: "b",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      false,
    );
  });
});

