import { useEffect, useRef } from "react";
import { t } from "../ui/i18n";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SeparationAgainConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="separation-again-confirm"
      aria-labelledby="separation-again-confirm-title"
      aria-describedby="separation-again-confirm-body"
      data-testid="separation-again-confirm"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="separation-again-confirm-title">
        {t("separate.again.confirmTitle")}
      </h2>
      <p id="separation-again-confirm-body">
        {t("separate.again.confirmBody")}
      </p>
      <div className="separation-again-confirm-actions">
        <button
          type="button"
          className="btn ghost"
          autoFocus
          onClick={onCancel}
        >
          {t("separate.again.confirmCancel")}
        </button>
        <button type="button" className="btn primary" onClick={onConfirm}>
          {t("separate.again.confirmSubmit")}
        </button>
      </div>
    </dialog>
  );
}
