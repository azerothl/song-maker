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
  onAddMidiTrack?: () => void;
  onAddInstrumentalPart?: () => void;
};

export function ProductionAddTrackMenu({
  busy,
  importingAudio,
  recordOpen,
  onImport,
  onToggleRecord,
  onAddMidiTrack,
  onAddInstrumentalPart,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const closeDialog = () => {
    setOpen(false);
    window.setTimeout(() => focusProfileElement(triggerRef.current), 0);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dialogRef.current?.contains(target)) return;
      closeDialog();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = listProfileFocusables(dialog);
    const firstChoice = dialog.querySelector<HTMLButtonElement>(
      ".production-add-track-choice-actions button:not(:disabled)",
    );
    focusProfileElement(firstChoice ?? items[0] ?? dialog);
    const onKey = (event: KeyboardEvent) => {
      handleProfileOverlayKeydown(event, dialog, closeDialog);
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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((value) => !value)}
      >
        {t("production.addTrack")}
      </button>
      {open && (
        <div
          ref={dialogRef}
          id={dialogId}
          className="production-add-track-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${dialogId}-title`}
          aria-describedby={`${dialogId}-hint`}
        >
          <div className="production-add-track-dialog-head">
            <div>
              <h2 id={`${dialogId}-title`}>{t("production.addTrack.dialogTitle")}</h2>
              <p id={`${dialogId}-hint`} className="hint">{t("production.addTrack.dialogHint")}</p>
            </div>
            <button type="button" className="btn ghost" onClick={closeDialog} aria-label={t("production.addTrack.close")}>
              ×
            </button>
          </div>
          <div className="production-add-track-choices">
            <section className="production-add-track-choice">
              <span className="production-add-track-symbol" aria-hidden="true">♫</span>
              <div>
                <h3>{t("production.addTrack.audio")}</h3>
                <p>{t("production.addTrack.audioHint")}</p>
              </div>
              <div className="production-add-track-choice-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || importingAudio}
                  onClick={() => { closeDialog(); onImport(); }}
                >
                  {importingAudio ? t("mix.importing") : t("production.addTrack.audioImport")}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  aria-expanded={recordOpen}
                  onClick={() => { closeDialog(); onToggleRecord(); }}
                >
                  {t("production.addTrack.audioRecord")}
                </button>
              </div>
            </section>
            <section className="production-add-track-choice">
              <span className="production-add-track-symbol" aria-hidden="true">▦</span>
              <div>
                <h3>{t("production.addTrack.midi")}</h3>
                <p>{t("production.addTrack.midiHint")}</p>
              </div>
              <div className="production-add-track-choice-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !onAddMidiTrack}
                  onClick={() => { closeDialog(); onAddMidiTrack?.(); }}
                >
                  {t("production.addTrack.midiCreate")}
                </button>
              </div>
            </section>
            <section className="production-add-track-choice">
              <span className="production-add-track-symbol" aria-hidden="true">✦</span>
              <div>
                <h3>{t("production.addTrack.ai")}</h3>
                <p>{t("production.addTrack.aiHint")}</p>
              </div>
              <div className="production-add-track-choice-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !onAddInstrumentalPart}
                  onClick={() => { closeDialog(); onAddInstrumentalPart?.(); }}
                >
                  {t("production.addTrack.aiCreate")}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
