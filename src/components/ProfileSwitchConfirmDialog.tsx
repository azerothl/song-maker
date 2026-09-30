import { useEffect, useRef } from "react";
import type { ProfileSummary } from "../lib/profilesTypes";
import { t } from "../ui/i18n";

type Props = {
  open: boolean;
  current: ProfileSummary;
  target: ProfileSummary;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ProfileSwitchConfirmDialog({
  open,
  current,
  target,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="profile-modal-backdrop" role="presentation">
      <div
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
