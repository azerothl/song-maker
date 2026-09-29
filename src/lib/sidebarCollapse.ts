/** Persist and compute left-sidebar collapsed state (#125, #155). */

export const SIDEBAR_COLLAPSED_KEY = "song-maker.sidebar.collapsed";

/** Auto-collapse when the viewport is narrower than this (px). */
export const SIDEBAR_NARROW_MAX_PX = 1099;

export const SIDEBAR_NARROW_MEDIA = `(max-width: ${SIDEBAR_NARROW_MAX_PX}px)`;

export const SIDEBAR_WIDTH_EXPANDED_PX = 220;
export const SIDEBAR_WIDTH_COLLAPSED_PX = 56;

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
 * État visuel replié : fenêtre étroite sauf si l’utilisateur a forcé le dépliage (`narrowOverride`).
 */
export function computeSidebarCollapsed(
  userCollapsed: boolean,
  narrowViewport: boolean,
  narrowOverride: boolean,
): boolean {
  if (narrowViewport) return !narrowOverride;
  return userCollapsed;
}

/** @deprecated Utiliser computeSidebarCollapsed avec narrowOverride */
export function effectiveSidebarCollapsed(
  userCollapsed: boolean,
  narrowViewport: boolean,
): boolean {
  return computeSidebarCollapsed(userCollapsed, narrowViewport, false);
}

export function applySidebarToggle(
  userCollapsed: boolean,
  narrowViewport: boolean,
  narrowOverride: boolean,
): { userCollapsed: boolean; narrowOverride: boolean } {
  if (narrowViewport) {
    return { userCollapsed, narrowOverride: !narrowOverride };
  }
  return { userCollapsed: !userCollapsed, narrowOverride: false };
}

export function clearNarrowOverrideOnWideViewport(
  narrowViewport: boolean,
  narrowOverride: boolean,
): boolean {
  return narrowViewport ? narrowOverride : false;
}
