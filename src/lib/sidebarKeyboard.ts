/** Raccourci global Ctrl/⌘+B pour replier la barre latérale (#155). */

export function matchesSidebarToggleShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
  return event.key.toLowerCase() === "b";
}

/** Ne pas intercepter Ctrl+B dans les champs de texte (gras, saisie, paroles). */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export function shouldHandleSidebarToggleShortcut(
  event: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  target: EventTarget | null,
): boolean {
  if (!matchesSidebarToggleShortcut(event)) return false;
  return !isTextEditingTarget(target);
}
