/** Délai CSS de disparition infobulle repliée (WCAG 1.4.13). */
export const SIDEBAR_TIP_HIDE_DELAY_MS = 150;

export type TipPointerProbe = {
  label: string;
  centerXPx: number;
  centerYPx: number;
  topTag: string;
  topClass: string;
  hitsSidebarTip: boolean;
};

export function tipPointerProbeFromHit(
  label: string,
  centerX: number,
  centerY: number,
  element: Element | null,
): TipPointerProbe {
  const el = element as HTMLElement | null;
  return {
    label,
    centerXPx: Math.round(centerX * 100) / 100,
    centerYPx: Math.round(centerY * 100) / 100,
    topTag: el?.tagName?.toLowerCase() ?? "",
    topClass: typeof el?.className === "string" ? el.className : "",
    hitsSidebarTip: el?.classList?.contains("sidebar-tip") ?? false,
  };
}

export function allTipsMissPointer(probes: TipPointerProbe[]): boolean {
  return probes.length > 0 && probes.every((p) => !p.hitsSidebarTip);
}
