import { useEffect, useId, useRef, useState } from "react";
import {
  handleProfileOverlayKeydown,
  listProfileFocusables,
  focusProfileElement,
} from "../../lib/profileDialogA11y";
import { t } from "../../ui/i18n";

type Props = {
  busy: boolean;
  importingAudio: boolean;
  recordOpen: boolean;
  onImport: () => void;
  onToggleRecord: () => void;
  onAddEmptyTrack?: () => void;
  onAddInstrumentalPart?: () => void;
};

export function ProductionAddTrackMenu({
  busy,
  importingAudio,
  recordOpen,
  onImport,
  onToggleRecord,
  onAddEmptyTrack,
  onAddInstrumentalPart,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const closeMenu = () => {
    setOpen(false);
    window.setTimeout(() => focusProfileElement(triggerRef.current), 0);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = listProfileFocusables(menu);
    focusProfileElement(items[0] ?? menu);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        closeMenu();
        return;
      }
      handleProfileOverlayKeydown(e, menu, closeMenu);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className="production-add-track-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="btn production-add-track-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {t("production.addTrack")}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="production-add-track-menu"
          role="menu"
          aria-label={t("production.addTrack.menu")}
        >
          <button
            type="button"
            role="menuitem"
            className="btn production-add-track-item"
            disabled={busy || importingAudio}
            onClick={() => {
              closeMenu();
              onImport();
            }}
          >
            {importingAudio ? t("mix.importing") : t("mix.importAudio")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn production-add-track-item"
            disabled={busy}
            aria-expanded={recordOpen}
            onClick={() => {
              closeMenu();
              onToggleRecord();
            }}
          >
            {t("mix.recordAudio")}
          </button>
          {onAddEmptyTrack ? (
            <button
              type="button"
              role="menuitem"
              className="btn production-add-track-item"
              disabled={busy}
              onClick={() => {
                closeMenu();
                onAddEmptyTrack();
              }}
            >
              {t("production.addTrack.empty")}
            </button>
          ) : null}
          {onAddInstrumentalPart ? (
            <button
              type="button"
              role="menuitem"
              className="btn production-add-track-item"
              disabled={busy}
              onClick={() => {
                closeMenu();
                onAddInstrumentalPart();
              }}
            >
              {t("production.addTrack.instrumental")}
            </button>
          ) : null}
          <p className="hint production-add-track-hint">{t("mix.importHint")}</p>
        </div>
      )}
    </div>
  );
}
