/** Keyboard helpers for profile selector menu + switch dialog (#212 R1). */

export const PROFILE_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function listProfileFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(PROFILE_FOCUSABLE_SELECTOR),
  ).filter((el) => {
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.tabIndex < 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  });
}

export function focusProfileElement(el: HTMLElement | null | undefined): void {
  el?.focus();
}

/** Trap Tab within container; ArrowUp/Down (and Left/Right) move focus. Escape → onEscape. */
export function handleProfileOverlayKeydown(
  event: KeyboardEvent,
  container: HTMLElement,
  onEscape: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onEscape();
    return;
  }

  const items = listProfileFocusables(container);
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const at = currentIndex >= 0 ? currentIndex : 0;

  if (event.key === "Tab") {
    event.preventDefault();
    event.stopPropagation();
    const next = event.shiftKey
      ? (at - 1 + items.length) % items.length
      : (at + 1) % items.length;
    focusProfileElement(items[next]);
    return;
  }

  if (
    event.key === "ArrowDown" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowLeft"
  ) {
    event.preventDefault();
    event.stopPropagation();
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const next = forward
      ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    focusProfileElement(items[next]);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    event.stopPropagation();
    focusProfileElement(items[0]);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    event.stopPropagation();
    focusProfileElement(items[items.length - 1]);
  }
}
