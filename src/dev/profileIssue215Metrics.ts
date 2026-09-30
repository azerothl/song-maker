/** Mesures navigateur pour #215 (popover profil replié). */

export type ProfilePopoverRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ProfilePopoverOverlap = {
  overlapsTrigger: boolean;
  overlapsSidebar: boolean;
  withinViewport: boolean;
};

export type ProfilePopoverLabelSample = {
  nameTruncated: boolean;
  metaTruncated: boolean;
  nameTitle: string;
  metaTitle: string;
};

export type ProfilePopoverMetrics = {
  popover: ProfilePopoverRect;
  trigger: ProfilePopoverRect;
  sidebar: ProfilePopoverRect;
  overlap: ProfilePopoverOverlap;
  labels: ProfilePopoverLabelSample[];
  menuZIndex: string;
  sidebarZIndex: string;
  mainZIndex: string;
  menuMaxWidth: string;
  menuMaxHeight: string;
  menuOverflowY: string;
  gapTriggerToPopoverPx: number;
  dialogBackdropZIndex: string | null;
};

export type ExpandedMenuMetrics = {
  menuHeight: number;
  menuWidth: number;
  firstItemNameScrollWidth: number;
  firstItemNameClientWidth: number;
  nameTruncated: boolean;
};

export type MenuSixProfilesViewportMetrics = {
  viewportHeight: number;
  popoverBottom: number;
  popoverWithinViewport: boolean;
  htmlScrollTop: number;
};

function rect(el: Element): ProfilePopoverRect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function overlaps(a: ProfilePopoverRect, b: ProfilePopoverRect): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

function isEllipsisActive(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function measureProfilePopoverCollapsed(): ProfilePopoverMetrics | null {
  const menu = document.querySelector<HTMLElement>('[data-testid="profile-selector-menu"]');
  const trigger = document.querySelector<HTMLElement>('[data-testid="profile-selector-trigger"]');
  const sidebar = document.querySelector<HTMLElement>("#sidebar");
  if (!menu || !trigger || !sidebar) return null;

  const popover = rect(menu);
  const triggerR = rect(trigger);
  const sidebarR = rect(sidebar);
  const menuStyle = getComputedStyle(menu);
  const sidebarStyle = getComputedStyle(sidebar);

  const labels: ProfilePopoverLabelSample[] = [];
  for (const row of Array.from(menu.querySelectorAll<HTMLElement>(".profile-menu-item"))) {
    const name = row.querySelector<HTMLElement>(".profile-menu-item-name");
    const meta = row.querySelector<HTMLElement>(".profile-menu-item-meta");
    if (!name || !meta) continue;
    labels.push({
      nameTruncated: isEllipsisActive(name),
      metaTruncated: isEllipsisActive(meta),
      nameTitle: name.getAttribute("title") ?? "",
      metaTitle: meta.getAttribute("title") ?? "",
    });
  }

  const main = document.querySelector<HTMLElement>(".main");
  const dialogBackdrop = document.querySelector<HTMLElement>(".profile-modal-backdrop");

  return {
    popover,
    trigger: triggerR,
    sidebar: sidebarR,
    overlap: {
      overlapsTrigger: overlaps(popover, triggerR),
      overlapsSidebar: overlaps(popover, sidebarR),
      withinViewport:
        popover.left >= 0 &&
        popover.top >= 0 &&
        popover.right <= window.innerWidth &&
        popover.bottom <= window.innerHeight,
    },
    labels,
    menuZIndex: menuStyle.zIndex,
    sidebarZIndex: sidebarStyle.zIndex,
    mainZIndex: main ? getComputedStyle(main).zIndex : "auto",
    menuMaxWidth: menuStyle.maxWidth,
    menuMaxHeight: menuStyle.maxHeight,
    menuOverflowY: menuStyle.overflowY,
    gapTriggerToPopoverPx: popover.left - triggerR.right,
    dialogBackdropZIndex: dialogBackdrop ? getComputedStyle(dialogBackdrop).zIndex : null,
  };
}

export function measureExpandedMenuOpen(): ExpandedMenuMetrics | null {
  const menu = document.querySelector<HTMLElement>('[data-testid="profile-selector-menu"]');
  const sidebar = document.querySelector<HTMLElement>("#sidebar");
  if (!menu || !sidebar || sidebar.classList.contains("is-collapsed")) return null;
  const name = menu.querySelector<HTMLElement>(".profile-menu-item-name");
  if (!name) return null;
  const menuR = rect(menu);
  return {
    menuHeight: menuR.height,
    menuWidth: menuR.width,
    firstItemNameScrollWidth: name.scrollWidth,
    firstItemNameClientWidth: name.clientWidth,
    nameTruncated: isEllipsisActive(name),
  };
}

export function measureMenuSixProfilesViewport(): MenuSixProfilesViewportMetrics | null {
  const menu = document.querySelector<HTMLElement>('[data-testid="profile-selector-menu"]');
  if (!menu) return null;
  const popover = rect(menu);
  return {
    viewportHeight: window.innerHeight,
    popoverBottom: popover.bottom,
    popoverWithinViewport: popover.bottom <= window.innerHeight + 0.5,
    htmlScrollTop: document.documentElement.scrollTop,
  };
}
