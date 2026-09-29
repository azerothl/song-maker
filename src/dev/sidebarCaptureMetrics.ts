import {
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
} from "../lib/sidebarCollapse";
import { SIDEBAR_HOVER_CONTRAST_RATIO } from "../lib/sidebarContrast";

function r1(v: number): number {
  return Math.round(v * 100) / 100;
}

function rect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

export type SidebarCaptureMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  sidebarWidthPx: number;
  mockupSidebarExpandedPx: number;
  mockupSidebarCollapsedPx: number;
  toggleAriaExpanded: string | null;
  toggleAriaLabel: string | null;
  toggleSizePx: [number, number];
  navTargetSizesPx: Array<[number, number]>;
  hoverContrastRatio: number;
  checks: {
    widthMatchesExpanded: boolean;
    widthMatchesCollapsed: boolean;
    targetsAtLeast44Px: boolean;
    hoverContrastAa: boolean;
  };
};

export function measureSidebarCapture(): SidebarCaptureMetrics | null {
  const sidebar = document.querySelector("#sidebar");
  const toggle = document.querySelector(".sidebar-toggle");
  if (!sidebar || !toggle) return null;

  const navButtons = Array.from(document.querySelectorAll("#sidebar-nav button"));
  const sizes = navButtons.map((b) => {
    const r = rect(b);
    return [r1(r.width), r1(r.height)] as [number, number];
  });
  const tr = rect(toggle);
  const sw = r1(rect(sidebar).width);
  const expanded = Math.abs(sw - SIDEBAR_WIDTH_EXPANDED_PX) <= 2;
  const collapsed = Math.abs(sw - SIDEBAR_WIDTH_COLLAPSED_PX) <= 2;
  const targetsOk = [toggle, ...navButtons].every((el) => {
    const r = rect(el);
    return r.width >= 44 && r.height >= 44;
  });

  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    sidebarWidthPx: sw,
    mockupSidebarExpandedPx: SIDEBAR_WIDTH_EXPANDED_PX,
    mockupSidebarCollapsedPx: SIDEBAR_WIDTH_COLLAPSED_PX,
    toggleAriaExpanded: toggle.getAttribute("aria-expanded"),
    toggleAriaLabel: toggle.getAttribute("aria-label"),
    toggleSizePx: [r1(tr.width), r1(tr.height)],
    navTargetSizesPx: sizes,
    hoverContrastRatio: SIDEBAR_HOVER_CONTRAST_RATIO,
    checks: {
      widthMatchesExpanded: expanded,
      widthMatchesCollapsed: collapsed,
      targetsAtLeast44Px: targetsOk,
      hoverContrastAa: SIDEBAR_HOVER_CONTRAST_RATIO >= 4.5,
    },
  };
}
