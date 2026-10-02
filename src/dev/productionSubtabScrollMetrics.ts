/** Mesures DOM pour défilement de la page Production commune (#203, #230). */

/** Aligné sur l’ancienne `--production-clips-top-min-height` (bande chrome clips). */
export const PRODUCTION_CLIPS_TOP_MIN_HEIGHT_PX = 200;

/** Zone liste pistes Mix (`.production-mix-scroll` clientHeight) sur main a600209/2c85db0. */
export const MAIN_MIX_TRACK_ZONE_HEIGHT_PX: Record<number, number> = {
  640: 424,
  720: 504,
  768: 552,
};

function rect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function inViewport(r: DOMRect, vh: number): boolean {
  return r.height > 0 && r.top >= -1 && r.bottom <= vh + 1;
}

function inScrollViewport(el: Element, scrollEl: HTMLElement): boolean {
  const c = scrollEl.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  return e.height > 0 && e.top >= c.top - 1 && e.bottom <= c.bottom + 1;
}

function reachableInScroll(
  scrollEl: HTMLElement,
  target: Element | null,
): boolean {
  if (!target) return false;
  const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  const saved = scrollEl.scrollTop;
  for (let st = 0; st <= max; st += 12) {
    scrollEl.scrollTop = st;
    if (inScrollViewport(target, scrollEl)) {
      scrollEl.scrollTop = saved;
      return true;
    }
  }
  scrollEl.scrollTop = max;
  const ok = inScrollViewport(target, scrollEl);
  scrollEl.scrollTop = saved;
  return ok;
}

function countFullyVisibleInScroll(scrollEl: HTMLElement, itemSel: string): number {
  const c = scrollEl.getBoundingClientRect();
  let n = 0;
  for (const item of Array.from(scrollEl.querySelectorAll(itemSel))) {
    const r = item.getBoundingClientRect();
    if (r.height > 0 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1) {
      n += 1;
    }
  }
  return n;
}

/** Vestiges sous-onglets (#230) : doit rester 0 sur la page Production. */
export function countProductionSubtabVestiges(root: ParentNode = document): number {
  return root.querySelectorAll(
    '[id^="production-panel-"],[id^="production-view-"],.production-subnav',
  ).length;
}

export type ProductionSubtabScrollMetrics = {
  viewport: { width: number; height: number };
  subtabVestigeCount: number;
  tools: {
    scrollHeight: number;
    clientHeight: number;
    scrolls: boolean;
    rackEndReachable: boolean;
    rackBottomPx: number | null;
  } | null;
  clips: {
    topClientHeightPx: number;
    topScrollHeightPx: number;
    topScrolls: boolean;
    lanesClientHeightPx: number;
    lanesScrollHeightPx: number;
    lanesScrolls: boolean;
    lanesFullTracksVisible: number;
    topArrangementReachable: boolean;
    lanesLastTrackReachable: boolean;
    lanesRulerReachable: boolean;
    lanesTabIndex: string | null;
  } | null;
  mix: {
    trackZoneClientHeightPx: number;
    trackZoneScrollHeightPx: number;
  } | null;
  mixToolbar: {
    barHeightPx: number;
    mixButtonHeightPx: number;
  } | null;
};

export function measureProductionSubtabScroll(): ProductionSubtabScrollMetrics {
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const subtabVestigeCount = countProductionSubtabVestiges();

  const toolsScroll = document.querySelector(
    '[data-testid="production-tools-scroll"]',
  ) as HTMLElement | null;
  const clipsTopScroll = document.querySelector(
    '[data-testid="production-clips-scroll"]',
  ) as HTMLElement | null;
  const rack = document.querySelector(
    '[data-testid="phase3-fx-rack"]',
  ) as HTMLElement | null;
  const lanes = document.querySelector(
    '[data-testid="clip-timeline-lanes"]',
  ) as HTMLElement | null;
  const mixScroll = document.querySelector(
    ".production-mix-scroll",
  ) as HTMLElement | null;
  const mixBar = document.querySelector(
    ".production-mix-toolbar-sticky",
  ) as HTMLElement | null;
  const mixBtn = document.querySelector(
    '[data-testid="production-mix-settings-trigger"]',
  ) as HTMLElement | null;

  let tools: ProductionSubtabScrollMetrics["tools"] = null;
  if (toolsScroll) {
    const before = toolsScroll.scrollTop;
    let rackEndReachable = false;
    let rackRect: DOMRect | null = null;
    if (rack) {
      const c0 = toolsScroll.getBoundingClientRect();
      const e0 = rack.getBoundingClientRect();
      const overflowBottom = e0.bottom - c0.bottom;
      if (overflowBottom > 0) {
        toolsScroll.scrollTop += overflowBottom;
      }
      rackRect = rect(rack);
      rackEndReachable = inViewport(rackRect, vh);
    }
    toolsScroll.scrollTop = before;
    tools = {
      scrollHeight: toolsScroll.scrollHeight,
      clientHeight: toolsScroll.clientHeight,
      scrolls: toolsScroll.scrollHeight > toolsScroll.clientHeight,
      rackEndReachable,
      rackBottomPx: rackRect ? r1(rackRect.bottom) : null,
    };
  }

  let clips: ProductionSubtabScrollMetrics["clips"] = null;
  if (clipsTopScroll && lanes) {
    const arrangement = clipsTopScroll.querySelector(".clip-arrangement-bar");
    const topArrangementReachable = reachableInScroll(
      clipsTopScroll,
      arrangement,
    );
    const lastLane = lanes.querySelector(".clip-lane:last-of-type");
    const ruler = lanes.querySelector(".clip-ruler");
    const lanesLastTrackReachable = reachableInScroll(lanes, lastLane);
    const lanesRulerReachable = reachableInScroll(lanes, ruler);

    clips = {
      topClientHeightPx: Math.round(clipsTopScroll.getBoundingClientRect().height),
      topScrollHeightPx: clipsTopScroll.scrollHeight,
      topScrolls: clipsTopScroll.scrollHeight > clipsTopScroll.clientHeight,
      lanesClientHeightPx: r1(lanes.clientHeight),
      lanesScrollHeightPx: lanes.scrollHeight,
      lanesScrolls: lanes.scrollHeight > lanes.clientHeight,
      lanesFullTracksVisible: countFullyVisibleInScroll(lanes, ".clip-lane"),
      topArrangementReachable,
      lanesLastTrackReachable,
      lanesRulerReachable,
      lanesTabIndex: lanes.getAttribute("tabindex"),
    };
  }

  let mix: ProductionSubtabScrollMetrics["mix"] = null;
  if (mixScroll) {
    mix = {
      trackZoneClientHeightPx: r1(mixScroll.clientHeight),
      trackZoneScrollHeightPx: mixScroll.scrollHeight,
    };
  }

  let mixToolbar: ProductionSubtabScrollMetrics["mixToolbar"] = null;
  if (mixBar && mixBtn) {
    mixToolbar = {
      barHeightPx: r1(rect(mixBar).height),
      mixButtonHeightPx: r1(rect(mixBtn).height),
    };
  }

  return {
    viewport: { width: vw, height: vh },
    subtabVestigeCount,
    tools,
    clips,
    mix,
    mixToolbar,
  };
}
