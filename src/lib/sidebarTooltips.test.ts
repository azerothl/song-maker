import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearSidebarRowTipOff,
  dismissAllSidebarTips,
  shouldDismissSidebarTipsOnKey,
  SIDEBAR_ROW_TIP_OFF_CLASS,
} from "./sidebarTooltips";

describe("shouldDismissSidebarTipsOnKey", () => {
  it("réagit à Échap uniquement", () => {
    assert.equal(shouldDismissSidebarTipsOnKey("Escape"), true);
    assert.equal(shouldDismissSidebarTipsOnKey("Enter"), false);
  });
});

describe("dismissAllSidebarTips / clearSidebarRowTipOff", () => {
  it("pose et retire tip-off sur une ligne", () => {
    const classes = new Set<string>();
    const row = {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    };
    const nodeList = {
      length: 1,
      item: (i: number) => (i === 0 ? row : null),
      forEach: (fn: (n: typeof row) => void) => fn(row),
      [Symbol.iterator]: function* () {
        yield row;
      },
    } as unknown as NodeListOf<Element>;
    dismissAllSidebarTips({ querySelectorAll: () => nodeList });
    assert.ok(classes.has(SIDEBAR_ROW_TIP_OFF_CLASS));
    clearSidebarRowTipOff(row);
    assert.equal(classes.has(SIDEBAR_ROW_TIP_OFF_CLASS), false);
  });
});
