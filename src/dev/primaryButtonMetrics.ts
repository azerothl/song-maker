import {
  measurePrimaryButtonFromDom,
  type PrimaryButtonContrastState,
  type PrimaryButtonDomMeasure,
} from "../lib/primaryButtonContrast";

function buttonLabel(el: HTMLButtonElement, index: number): string {
  const text = el.textContent?.trim().replace(/\s+/g, " ");
  return text && text.length > 0 ? text.slice(0, 80) : `bouton-${index + 1}`;
}

export type PrimaryButtonPageMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  buttonsFound: number;
  samples: Array<{
    index: number;
    label: string;
    normal: PrimaryButtonDomMeasure;
  }>;
  allPassAa: boolean;
};

/** Mesure tous les `.btn.primary` visibles (état normal) via styles calculés. */
export function measurePrimaryButtonsOnPage(): PrimaryButtonPageMetrics {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button.btn.primary"),
  ).filter((btn) => {
    const style = getComputedStyle(btn);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = btn.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const samples = buttons.map((btn, index) => ({
    index,
    label: buttonLabel(btn, index),
    normal: measurePrimaryButtonFromDom(btn, "normal"),
  }));

  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    buttonsFound: buttons.length,
    samples,
    allPassAa: samples.every((s) => s.normal.passAa),
  };
}

declare global {
  interface Window {
    __primaryButtonMetrics?: () => PrimaryButtonPageMetrics;
    __measurePrimaryButtonFromDom?: (
      state: PrimaryButtonContrastState,
    ) => PrimaryButtonDomMeasure | null;
  }
}

export function attachPrimaryButtonMetricsWindow(): void {
  window.__primaryButtonMetrics = () => measurePrimaryButtonsOnPage();
  window.__measurePrimaryButtonFromDom = (state) => {
    const btn = document.querySelector("button.btn.primary");
    if (!btn) return null;
    return measurePrimaryButtonFromDom(btn, state);
  };
}
