export type TabListOrientation = "horizontal" | "vertical";

export function nextRovingTabIndex(
  key: string,
  currentIndex: number,
  count: number,
  orientation: TabListOrientation = "horizontal",
): number | null {
  if (count <= 0 || currentIndex < 0 || currentIndex >= count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;

  if (orientation === "vertical") {
    if (key === "ArrowUp") return (currentIndex + count - 1) % count;
    if (key === "ArrowDown") return (currentIndex + 1) % count;
    return null;
  }

  if (key === "ArrowLeft") return (currentIndex + count - 1) % count;
  if (key === "ArrowRight") return (currentIndex + 1) % count;
  return null;
}

type TabListKeyEvent = {
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
};

/** Move focus and activate a tab, following the automatic-activation tab pattern. */
export function handleRovingTabListKeyDown(event: TabListKeyEvent): void {
  if (!(event.target instanceof Element)) return;
  const current = event.target.closest<HTMLElement>('[role="tab"]');
  const tabList = current?.closest<HTMLElement>('[role="tablist"]');
  if (!current || !tabList) return;

  const tabs = Array.from(
    tabList.querySelectorAll<HTMLElement>(
      '[role="tab"]:not(:disabled):not([aria-disabled="true"])',
    ),
  ).filter((tab) => !tab.hidden);
  const currentIndex = tabs.indexOf(current);
  const orientation = tabList.getAttribute("aria-orientation") === "vertical"
    ? "vertical"
    : "horizontal";
  const nextIndex = nextRovingTabIndex(event.key, currentIndex, tabs.length, orientation);
  if (nextIndex === null) return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}
