import {
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

/**
 * Non-blocking anchored panel (#132): playback and mix stay usable underneath.
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
  const popinId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;
    const maxW = Math.min(
      className?.includes("separation-recommend") ||
        className?.includes("export-dialog")
        ? 520
        : 420,
      window.innerWidth - margin * 2,
    );
    panel.style.width = `${maxW}px`;
    const panelRect = panel.getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth - margin) {
      left = window.innerWidth - panelRect.width - margin;
    }
    if (left < margin) left = margin;
    // Prefer keeping the capped panel fully in the viewport (sticky footer (#187)).
    const maxPanelH = Math.min(
      window.innerHeight * 0.8,
      window.innerHeight - margin * 2,
    );
    if (panelRect.height > maxPanelH - 1) {
      panel.style.maxHeight = `${maxPanelH}px`;
    }
    const height = Math.min(panel.getBoundingClientRect().height, maxPanelH);
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - height - margin);
    }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    focusFirst(panel);
  }, [open, anchorRef, className]);

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
