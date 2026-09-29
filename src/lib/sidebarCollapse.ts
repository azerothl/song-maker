/** Persist and compute left-sidebar collapsed state (#125). */

export const SIDEBAR_COLLAPSED_KEY = "song-maker.sidebar.collapsed";

/** Auto-collapse when the viewport is narrower than this (px). */
export const SIDEBAR_NARROW_MAX_PX = 1099;

export const SIDEBAR_NARROW_MEDIA = `(max-width: ${SIDEBAR_NARROW_MAX_PX}px)`;

export function readSidebarCollapsedPref(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage,
): boolean {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsedPref(
  collapsed: boolean,
  storage: Pick<Storage, "setItem"> | null | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Effective collapsed state: auto-collapsed under the narrow breakpoint,
 * otherwise the persisted user preference.
 */
export function effectiveSidebarCollapsed(
  userCollapsed: boolean,
  narrowViewport: boolean,
): boolean {
  return narrowViewport || userCollapsed;
}
