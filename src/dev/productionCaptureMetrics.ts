/** Mesures DOM pour captures Playwright (getBoundingClientRect). */

function r1(v: number): number {
  return Math.round(v * 100) / 100;
}

function rect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

export type ProductionCaptureMetrics = {
  density: string;
  densityPreference: string;
  tracksTotal: number;
  rowHeightPx: number[];
  msButtonPx: {
    w: number;
    h: number;
    wSolo: number;
    hMute: number;
    gapX: number;
    sameRow: boolean;
    minWAllRows: number;
    minHAllRows: number;
    pairTotalW: number;
    pairTotalH: number;
  } | null;
  knobsPx: Array<{ w: number; h: number; marginTop: number; marginBottom: number }>;
  knobMinVerticalMarginAllRows: number | null;
  groupHeader: {
    heightPx: number;
    msVisiblePx: Array<{ w: number; h: number }>;
    msHitHeightPx: number;
  } | null;
  nameColumnPx: number | null;
  truncatedHaveTitle: boolean;
  rowsFullyVisible: number;
  listScrolls: boolean;
  scrollHeight: number;
  clientHeight: number;
};

export function measureProductionMix(): ProductionCaptureMetrics | null {
  const scroll = document.querySelector(".production-mix-scroll");
  const panel = document.querySelector(".mixer-density");
  if (!scroll || !panel) return null;

  const scrollRect = rect(scroll);
  const vis = (e: Element) => (e as HTMLElement).offsetParent !== null;
  const rows = Array.from(document.querySelectorAll(".production-mix-row")).filter(vis);
  const groups = Array.from(document.querySelectorAll(".production-mix-group-header"));

  const fullyRows = rows.filter((r) => {
    const b = rect(r);
    return b.top >= scrollRect.top - 1 && b.bottom <= scrollRect.bottom + 1;
  });

  const one = rows[0];
  let msBlock: ProductionCaptureMetrics["msButtonPx"] = null;
  let knobsPx: ProductionCaptureMetrics["knobsPx"] = [];
  let knobMin: number | null = null;
  let nameColumnPx: number | null = null;

  if (one) {
    const rb = rect(one);
    const ms = Array.from(one.querySelectorAll(".track-ms-btn")).map(rect);
    const allMs = rows.flatMap((r) =>
      Array.from(r.querySelectorAll(".track-ms-btn")).map(rect),
    );
    if (ms.length >= 2) {
      msBlock = {
        w: r1(ms[0].width),
        h: r1(ms[0].height),
        wSolo: r1(ms[1].width),
        hMute: r1(ms[0].height),
        gapX: r1(ms[1].left - ms[0].right),
        sameRow: Math.abs(ms[0].top - ms[1].top) < 0.5,
        minWAllRows: r1(Math.min(...allMs.map((b) => b.width))),
        minHAllRows: r1(Math.min(...allMs.map((b) => b.height))),
        pairTotalW: r1(ms[1].right - ms[0].left),
        pairTotalH: r1(Math.max(ms[0].height, ms[1].height)),
      };
    }

    const knMargins: number[] = [];
    for (const row of rows) {
      const q = rect(row);
      for (const k of Array.from(row.querySelectorAll(".mix-knob-dial"))) {
        const b = rect(k);
        knMargins.push(Math.min(b.top - q.top, q.bottom - b.bottom));
      }
    }
    knobMin = knMargins.length ? r1(Math.min(...knMargins)) : null;

    const knobsOnFirst = Array.from(one.querySelectorAll(".mix-knob-dial")).map((k) => {
      const b = rect(k);
      return {
        w: r1(b.width),
        h: r1(b.height),
        marginTop: r1(b.top - rb.top),
        marginBottom: r1(rb.bottom - b.bottom),
      };
    });
    knobsPx = knobsOnFirst;

    const gridCell = one.querySelector(".production-mix-name");
    if (gridCell) {
      nameColumnPx = r1(rect(gridCell).width);
    }
  }

  const labels = Array.from(document.querySelectorAll(".production-mix-track-label"));
  const truncated = labels.filter(
    (n) => (n as HTMLElement).scrollWidth > (n as HTMLElement).clientWidth + 1,
  );
  const truncatedHaveTitle =
    truncated.length === 0 || truncated.every((n) => Boolean(n.getAttribute("title")));

  let groupHeader: ProductionCaptureMetrics["groupHeader"] = null;
  const gh = groups[0];
  if (gh) {
    const gms = Array.from(gh.querySelectorAll(".track-ms-btn")).map(rect);
    groupHeader = {
      heightPx: r1(rect(gh).height),
      msVisiblePx: gms.map((b) => ({ w: r1(b.width), h: r1(b.height) })),
      msHitHeightPx: gms[0] ? r1(gms[0].height) : 0,
    };
  }

  return {
    density: panel.getAttribute("data-density") ?? "",
    densityPreference: panel.getAttribute("data-density-preference") ?? "",
    tracksTotal: rows.length,
    rowHeightPx: [...new Set(rows.map((r) => r1(rect(r).height)))],
    msButtonPx: msBlock,
    knobsPx,
    knobMinVerticalMarginAllRows: knobMin,
    groupHeader,
    nameColumnPx,
    truncatedHaveTitle,
    rowsFullyVisible: fullyRows.length,
    listScrolls: scroll.scrollHeight > scroll.clientHeight + 1,
    scrollHeight: scroll.scrollHeight,
    clientHeight: scroll.clientHeight,
  };
}
