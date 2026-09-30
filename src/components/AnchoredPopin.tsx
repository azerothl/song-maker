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
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusFirst(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>(FOCUSABLE);
  el?.focus();
}

function panelMaxWidth(className?: string): number {
  if (
    className?.includes("separation-recommend") ||
    className?.includes("export-dialog")
  ) {
    return 520;
  }
  return 420;
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
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const positionedOnceRef = useRef(false);
  const popinId = useId();

  const positionPanel = useCallback(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const margin = 8;
    const rect = anchor.getBoundingClientRect();
    const maxW = Math.min(panelMaxWidth(className), window.innerWidth - margin * 2);
    panel.style.width = `${maxW}px`;

    const isExport = className?.includes("export-dialog");
    const maxPanelH = Math.min(
      window.innerHeight * 0.8,
      window.innerHeight - margin * 2,
      isExport ? 473 : window.innerHeight * 0.8,
    );
    panel.style.maxHeight = `${maxPanelH}px`;

    let left = rect.left;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth - margin) {
      left = window.innerWidth - panelRect.width - margin;
    }
    if (left < margin) left = margin;

    let height = Math.min(panel.getBoundingClientRect().height, maxPanelH);
    let top = rect.bottom + margin;
    if (top + height > window.innerHeight - margin) {
      const maxAbove = rect.top - margin * 2;
      height = Math.min(height, maxAbove, maxPanelH);
      const above = rect.top - margin - height;
      if (above >= margin) {
        top = above;
      } else {
        top = Math.max(margin, window.innerHeight - height - margin);
      }
    }
    if (top < margin) top = margin;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }, [anchorRef, className]);

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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    const el = returnFocusRef.current;
    if (el && document.contains(el)) {
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
