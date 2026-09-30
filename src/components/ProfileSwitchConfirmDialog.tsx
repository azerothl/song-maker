import { useEffect, useRef, type RefObject } from "react";
import {
  focusProfileElement,
  handleProfileOverlayKeydown,
} from "../lib/profileDialogA11y";
import type { ProfileSummary } from "../lib/profilesTypes";
import { t } from "../ui/i18n";

type Props = {
  open: boolean;
  current: ProfileSummary;
  target: ProfileSummary;
  onConfirm: () => void;
  onCancel: () => void;
  /** Element to restore focus to when the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function ProfileSwitchConfirmDialog({
  open,
  current,
  target,
  onConfirm,
  onCancel,
  returnFocusRef,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const restore = returnFocusRef?.current;
        if (restore) {
          queueMicrotask(() => focusProfileElement(restore));
        }
      }
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (justOpened) {
      focusProfileElement(cancelRef.current);
    }
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onKey = (e: KeyboardEvent) => {
      handleProfileOverlayKeydown(e, dialog, () => onCancelRef.current());
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="profile-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="profile-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="profile-switch-title"
        aria-describedby="profile-switch-body"
        data-testid="profile-switch-confirm-dialog"
      >
        <h2 id="profile-switch-title" className="profile-modal-title">
          {t("profiles.switch.confirm.title", { name: target.name })}
        </h2>
        <p id="profile-switch-body" className="profile-modal-body">
          {t("profiles.switch.confirm.body", { name: target.name })}
        </p>
        <div className="profile-modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn ghost profile-focusable"
            onClick={onCancel}
            data-testid="profile-switch-stay"
          >
            {t("profiles.switch.confirm.stay", { name: current.name })}
          </button>
          <button
            type="button"
            className="btn primary profile-focusable"
            onClick={onConfirm}
            data-testid="profile-switch-confirm"
          >
            {t("profiles.switch.confirm.switch")}
          </button>
        </div>
      </div>
    </div>
  );
}
