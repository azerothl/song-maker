/** WCAG 1.4.13 — infobulles repliées fermables au clavier (maquette sidebar-repliable). */

export const SIDEBAR_ROW_TIP_OFF_CLASS = "tip-off";

export function shouldDismissSidebarTipsOnKey(key: string): boolean {
  return key === "Escape";
}

type SidebarRowLike = { classList: { add(c: string): void; remove(c: string): void } };

export function dismissAllSidebarTips(sidebar: { querySelectorAll(s: string): NodeListOf<Element> }): void {
  Array.from(sidebar.querySelectorAll(".sidebar-row")).forEach((row) => {
    row.classList.add(SIDEBAR_ROW_TIP_OFF_CLASS);
  });
}

export function clearSidebarRowTipOff(row: SidebarRowLike): void {
  row.classList.remove(SIDEBAR_ROW_TIP_OFF_CLASS);
}

/** Branche Échap + réouverture au survol / focus sur la barre latérale repliée. */
export function bindSidebarTipDismiss(sidebar: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!shouldDismissSidebarTipsOnKey(event.key)) return;
    dismissAllSidebarTips(sidebar);
  };

  const onRowInteraction = (event: Event) => {
    const target = event.target;
    if (!target || typeof (target as Element).closest !== "function") return;
    const row = (target as Element).closest<HTMLElement>(".sidebar-row");
    if (!row || !sidebar.contains(row)) return;
    clearSidebarRowTipOff(row);
  };

  sidebar.addEventListener("mouseenter", onRowInteraction, true);
  sidebar.addEventListener("mouseleave", onRowInteraction, true);
  sidebar.addEventListener("focusout", onRowInteraction, true);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    sidebar.removeEventListener("mouseenter", onRowInteraction, true);
    sidebar.removeEventListener("mouseleave", onRowInteraction, true);
    sidebar.removeEventListener("focusout", onRowInteraction, true);
    for (const row of Array.from(sidebar.querySelectorAll<HTMLElement>(".sidebar-row"))) {
      clearSidebarRowTipOff(row);
    }
  };
}
