import { useEffect, useId, useRef, useState } from "react";
import { t } from "../ui/i18n";
import { warningLabel } from "../screens/song/shared";

type Props = {
  warningCodes: string[];
};

/**
 * Compact « Estimé * » marker with accessible tooltip (#132).
 */
export function EstimatedSeparationMarker({ warningCodes }: Props) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        btnRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  if (warningCodes.length === 0) return null;

  return (
    <span className="separation-estimated-wrap">
      <button
        ref={btnRef}
        type="button"
        className="separation-estimated-marker"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {t("separation.estimated.marker")}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={tipId}
          role="tooltip"
          className="separation-estimated-tip"
        >
          <p className="separation-estimated-tip-title">
            {t("separation.warn.title")}
          </p>
          <ul className="separation-estimated-tip-list">
            {warningCodes.map((code) => (
              <li key={code}>{warningLabel(code)}</li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
