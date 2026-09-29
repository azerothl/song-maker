import {
  SIDEBAR_WIDTH_COLLAPSED_PX,
  SIDEBAR_WIDTH_EXPANDED_PX,
} from "../lib/sidebarCollapse";
import {
  contrastRatioFromCssColors,
  SIDEBAR_HOVER_BG,
  SIDEBAR_HOVER_CONTRAST_RATIO,
  SIDEBAR_HOVER_TEXT,
} from "../lib/sidebarContrast";

function r1(v: number): number {
  return Math.round(v * 100) / 100;
}

function rect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

export type HoverContrastMeasure = {
  ratio: number;
  foregroundCss: string;
  backgroundCss: string;
  source: "dom" | "constants";
};

export type TooltipMeasure = {
  widthPx: number;
  heightPx: number;
  leftPx: number;
  topPx: number;
  gapToTriggerPx: number;
  opacity: number;
  foregroundCss: string;
  backgroundCss: string;
  contrastRatio: number;
};

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
  hoverContrast: HoverContrastMeasure;
  tooltip: TooltipMeasure | null;
  checks: {
    widthMatchesExpanded: boolean;
    widthMatchesCollapsed: boolean;
    targetsAtLeast44Px: boolean;
    hoverContrastAa: boolean;
    tooltipVisible: boolean;
  };
};

function measureHoverContrastFromDom(): HoverContrastMeasure | null {
  const hovered = document.querySelector(
    ".sidebar.is-collapsed .sidebar-row:hover button, .sidebar.is-collapsed .sidebar-row:hover .sidebar-meta-row",
  );
  if (!hovered) return null;
  const style = getComputedStyle(hovered);
  const fg = style.color;
  const bg = style.backgroundColor;
  const ratio = contrastRatioFromCssColors(fg, bg);
  if (ratio == null) return null;
  return { ratio, foregroundCss: fg, backgroundCss: bg, source: "dom" };
}

function constantsHoverContrast(): HoverContrastMeasure {
  return {
    ratio: SIDEBAR_HOVER_CONTRAST_RATIO,
    foregroundCss: SIDEBAR_HOVER_TEXT,
    backgroundCss: SIDEBAR_HOVER_BG,
    source: "constants",
  };
}

function measureVisibleTooltip(): TooltipMeasure | null {
  const tips = Array.from(document.querySelectorAll<HTMLElement>(".sidebar.is-collapsed .sidebar-tip"));
  for (const tip of tips) {
    const style = getComputedStyle(tip);
    const opacity = parseFloat(style.opacity);
    if (opacity < 0.95) continue;
    const tipRect = rect(tip);
    if (tipRect.width < 4 || tipRect.height < 4) continue;
    const row = tip.closest(".sidebar-row");
    const trigger = row?.querySelector("button, .sidebar-meta-row");
    if (!trigger) continue;
    const triggerRect = rect(trigger);
    const gap = r1(tipRect.left - triggerRect.right);
    const fg = style.color;
    const bg = style.backgroundColor;
    const contrast = contrastRatioFromCssColors(fg, bg) ?? 0;
    return {
      widthPx: r1(tipRect.width),
      heightPx: r1(tipRect.height),
      leftPx: r1(tipRect.left),
      topPx: r1(tipRect.top),
      gapToTriggerPx: gap,
      opacity: r1(opacity),
      foregroundCss: fg,
      backgroundCss: bg,
      contrastRatio: r1(contrast),
    };
  }
  return null;
}

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

  const tooltip = measureVisibleTooltip();
  const hoverContrast = measureHoverContrastFromDom() ?? constantsHoverContrast();

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
    hoverContrast,
    tooltip,
    checks: {
      widthMatchesExpanded: expanded,
      widthMatchesCollapsed: collapsed,
      targetsAtLeast44Px: targetsOk,
      hoverContrastAa: hoverContrast.ratio >= 4.5,
      tooltipVisible: tooltip != null,
    },
  };
}
