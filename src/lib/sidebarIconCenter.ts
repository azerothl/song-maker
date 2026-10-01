/** Centrage horizontal des icônes en barre latérale repliée (56 px → centre à 28 px). */

export const SIDEBAR_COLLAPSED_COLUMN_CENTER_OFFSET_PX = 28;
export const SIDEBAR_COLLAPSED_ICON_CENTER_TOLERANCE_PX = 1;

export function collapsedColumnCenterX(sidebarLeftPx: number, sidebarWidthPx: number): number {
  return sidebarLeftPx + sidebarWidthPx / 2;
}

export function iconCenterXFromRect(left: number, width: number): number {
  return left + width / 2;
}

export function iconCenterWithinTolerance(
  iconCenterXPx: number,
  columnCenterXPx: number,
  tolerancePx = SIDEBAR_COLLAPSED_ICON_CENTER_TOLERANCE_PX,
): boolean {
  return Math.abs(iconCenterXPx - columnCenterXPx) <= tolerancePx;
}
