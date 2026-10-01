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
import {
  collapsedColumnCenterX,
  iconCenterWithinTolerance,
  iconCenterXFromRect,
} from "../lib/sidebarIconCenter";
import {
  allTipsMissPointer,
  tipPointerProbeFromHit,
  type TipPointerProbe,
} from "../lib/sidebarTipPointer";

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

export type CollapsedIconCenterMeasure = {
  id: string;
  centerXPx: number;
  expectedCenterXPx: number;
  deltaPx: number;
  withinTolerance: boolean;
};

export type SidebarCaptureMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  sidebarWidthPx: number;
  collapsedTipPointerProbes: TipPointerProbe[] | null;
  mockupSidebarExpandedPx: number;
  mockupSidebarCollapsedPx: number;
  toggleAriaExpanded: string | null;
  toggleAriaLabel: string | null;
  toggleSizePx: [number, number];
  navTargetSizesPx: Array<[number, number]>;
  hoverContrast: HoverContrastMeasure;
  tooltip: TooltipMeasure | null;
  collapsedIconCenters: CollapsedIconCenterMeasure[] | null;
  checks: {
    widthMatchesExpanded: boolean;
    widthMatchesCollapsed: boolean;
    targetsAtLeast44Px: boolean;
    hoverContrastAa: boolean;
    tooltipVisible: boolean;
    collapsedIconsCentered: boolean;
    iconCenterById: Record<string, boolean>;
    tipsNeverCapturePointerAtRest: boolean;
  };
};

export function measureCollapsedTipPointerProbes(): TipPointerProbe[] | null {
  const sidebar = document.querySelector("#sidebar");
  if (!sidebar?.classList.contains("is-collapsed")) return null;

  const tips = Array.from(document.querySelectorAll<HTMLElement>(".sidebar.is-collapsed .sidebar-tip"));
  if (tips.length === 0) return null;

  return tips.map((tip, index) => {
    const r = tip.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const row = tip.closest(".sidebar-row");
    const trigger = row?.querySelector("button, .sidebar-meta-row");
    const label =
      trigger?.getAttribute("aria-label") ??
      tip.textContent?.trim().slice(0, 24) ??
      `tip-${index}`;
    const hit = document.elementFromPoint(cx, cy);
    return tipPointerProbeFromHit(label, cx, cy, hit);
  });
}

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
    if (style.visibility !== "visible" || opacity < 0.95) continue;
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

export function measureCollapsedIconCenters(sidebar: Element): CollapsedIconCenterMeasure[] | null {
  if (!sidebar.classList.contains("is-collapsed")) return null;

  const sidebarRect = rect(sidebar);
  const expected = r1(collapsedColumnCenterX(sidebarRect.left, sidebarRect.width));

  const entries: Array<{ id: string; el: Element }> = [];

  const brand = sidebar.querySelector(".brand-mark");
  if (brand) entries.push({ id: "brand-mark", el: brand });

  const toggleIcon = sidebar.querySelector(".sidebar-toggle .sidebar-icon");
  if (toggleIcon) entries.push({ id: "toggle", el: toggleIcon });

  sidebar.querySelectorAll<HTMLButtonElement>("#sidebar-nav button").forEach((btn) => {
    const icon = btn.querySelector(".sidebar-icon");
    const label = btn.getAttribute("aria-label") ?? "nav";
    if (icon) entries.push({ id: `nav:${label}`, el: icon });
  });

  sidebar.querySelectorAll<HTMLElement>(".sidebar-meta .sidebar-meta-row").forEach((row) => {
    const icon = row.querySelector(".sidebar-icon");
    const label = row.getAttribute("aria-label") ?? "meta";
    if (icon) entries.push({ id: `meta:${label}`, el: icon });
  });

  return entries.map(({ id, el }) => {
    const r = rect(el);
    const centerX = r1(iconCenterXFromRect(r.left, r.width));
    const delta = r1(centerX - expected);
    return {
      id,
      centerXPx: centerX,
      expectedCenterXPx: expected,
      deltaPx: delta,
      withinTolerance: iconCenterWithinTolerance(centerX, expected),
    };
  });
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
  const collapsedTipPointerProbes = collapsed ? measureCollapsedTipPointerProbes() : null;
  const hoverContrast = measureHoverContrastFromDom() ?? constantsHoverContrast();
  const collapsedIconCenters = measureCollapsedIconCenters(sidebar);
  const iconCenterById: Record<string, boolean> = {};
  if (collapsedIconCenters) {
    for (const row of collapsedIconCenters) {
      iconCenterById[row.id] = row.withinTolerance;
    }
  }
  const collapsedIconsCentered =
    collapsedIconCenters == null
      ? true
      : collapsedIconCenters.length > 0 &&
        collapsedIconCenters.every((row) => row.withinTolerance);

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
    collapsedTipPointerProbes,
    collapsedIconCenters,
    checks: {
      widthMatchesExpanded: expanded,
      widthMatchesCollapsed: collapsed,
      targetsAtLeast44Px: targetsOk,
      hoverContrastAa: hoverContrast.ratio >= 4.5,
      tooltipVisible: tooltip != null,
      collapsedIconsCentered,
      iconCenterById,
      tipsNeverCapturePointerAtRest:
        collapsedTipPointerProbes == null
          ? true
          : allTipsMissPointer(collapsedTipPointerProbes),
    },
  };
}
