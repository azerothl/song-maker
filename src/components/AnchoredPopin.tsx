import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  labelId: string;
  children: ReactNode;
  className?: string;
  /** Stable id for aria-controls on the trigger (#225). */
  panelId?: string;
  /** When true, Escape is left to nested dialogs (#225 B2). */
  deferEscapeClose?: boolean;
  /** Prefer opening above the anchor (Clips header #225). */
  preferAboveAnchor?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusFirst(container: HTMLElement) {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE),
  );
  const el =
    candidates.find((node) => !node.classList.contains("anchored-popin-close")) ??
    candidates[0];
  el?.focus();
}

const DIALOG_POPIN_MAX_PX = 473;

function panelMaxWidth(className?: string): number {
  if (
    className?.includes("separation-recommend") ||
    className?.includes("export-dialog")
  ) {
    return 520;
  }
  if (
    className?.includes("production-track-detail-popin") ||
    className?.includes("production-fx-line-popin")
  ) {
    return 720;
  }
  return 420;
}

function isDialogPopin(className?: string): boolean {
  return Boolean(
    className?.includes("separation-recommend") ||
      className?.includes("export-dialog"),
  );
}

/**
 * Non-blocking anchored panel (#132): playback and mix stay usable underneath.
 * Repositions when content or viewport size changes (#187 / B1).
 */
export function AnchoredPopin({
  open,
  onClose,
  anchorRef,
  labelId,
  children,
  className,
  panelId,
  deferEscapeClose = false,
  preferAboveAnchor = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const positionedOnceRef = useRef(false);
  const generatedPopinId = useId();
  const popinId = panelId ?? generatedPopinId;

  const positionPanel = useCallback(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const margin = 8;
    const rect = anchor.getBoundingClientRect();
    const maxW = Math.min(panelMaxWidth(className), window.innerWidth - margin * 2);
    panel.style.width = `${maxW}px`;

    const dialogPopin = isDialogPopin(className);
    const capH = dialogPopin
      ? DIALOG_POPIN_MAX_PX
      : window.innerHeight * 0.8;

    let left = rect.left;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth - margin) {
      left = window.innerWidth - panelRect.width - margin;
    }
    if (left < margin) left = margin;

    const belowTop = rect.bottom + margin;
    const maxBelow = window.innerHeight - belowTop - margin;
    const maxAbove = rect.top - margin * 2;

    let top = belowTop;
    let maxPanelH = Math.min(capH, maxBelow, window.innerHeight * 0.8);

    if (preferAboveAnchor && maxAbove >= 120) {
      maxPanelH = Math.min(capH, maxAbove, window.innerHeight * 0.8);
      panel.style.maxHeight = `${maxPanelH}px`;
      const height = Math.min(panel.getBoundingClientRect().height, maxPanelH);
      top = Math.max(margin, rect.top - margin - height);
    } else if (maxPanelH < 96 && maxAbove > maxBelow) {
      maxPanelH = Math.min(capH, maxAbove, window.innerHeight * 0.8);
      panel.style.maxHeight = `${maxPanelH}px`;
      const height = Math.min(panel.getBoundingClientRect().height, maxPanelH);
      top = Math.max(margin, rect.top - margin - height);
    } else {
      panel.style.maxHeight = `${Math.max(96, maxPanelH)}px`;
    }

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }, [anchorRef, className, preferAboveAnchor]);

  useLayoutEffect(() => {
    if (!open) {
      positionedOnceRef.current = false;
      return;
    }
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    positionPanel();
    if (!positionedOnceRef.current) {
      const panel = panelRef.current;
      if (panel) focusFirst(panel);
      positionedOnceRef.current = true;
    }
  }, [open, positionPanel]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    positionPanel();
    const ro = new ResizeObserver(() => {
      positionPanel();
    });
    ro.observe(panel);
    const onResize = () => positionPanel();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [open, positionPanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deferEscapeClose) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, deferEscapeClose]);

  useEffect(() => {
    if (open) return;
    const el = returnFocusRef.current;
    // A newly opened panel has already focused its controls in a layout effect.
    // Closing the previous panel must not move that focus back to its trigger.
    const focusedPanel = document.activeElement?.closest(".anchored-popin");
    if (el && document.contains(el) && !focusedPanel) {
      el.focus();
    }
    returnFocusRef.current = null;
  }, [open]);

  if (!open) return null;

  return (
    <div className="anchored-popin-layer" role="presentation">
      <div
        ref={panelRef}
        id={popinId}
        className={className ? `anchored-popin ${className}` : "anchored-popin"}
        role="dialog"
        aria-labelledby={labelId}
        aria-modal="false"
      >
        {children}
      </div>
    </div>
  );
}
