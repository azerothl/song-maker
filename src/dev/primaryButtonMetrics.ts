import {
  measurePrimaryButtonFromDom,
  type PrimaryButtonContrastState,
  type PrimaryButtonDomMeasure,
} from "../lib/primaryButtonContrast";

export function attachPrimaryButtonMetricsWindow(): void {
  window.__measurePrimaryButtonFromDom = (state, selector) => {
    const btn = document.querySelector(selector ?? "button.btn.primary");
    if (!btn) return null;
    return measurePrimaryButtonFromDom(btn, state);
  };
}

declare global {
  interface Window {
    __measurePrimaryButtonFromDom?: (
      state: PrimaryButtonContrastState,
      selector?: string,
    ) => PrimaryButtonDomMeasure | null;
  }
}
