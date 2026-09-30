import { useEffect, useId, useRef, useState } from "react";
import {
  focusProfileElement,
  handleProfileOverlayKeydown,
} from "../lib/profileDialogA11y";
import { t } from "../ui/i18n";

type Props = {
  open: boolean;
  currentName: string;
  typeLabel: string;
  onConfirm: (nextName: string) => void;
  onCancel: () => void;
};

/** Accessible rename dialog — replaces `window.prompt` (#212 polish). */
export function ProfileRenameDialog({
  open,
  currentName,
  typeLabel,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const hintId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(currentName);

  useEffect(() => {
    if (!open) return;
    setDraft(currentName);
  }, [open, currentName]);

  useEffect(() => {
    if (!open) return;
    focusProfileElement(inputRef.current);
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      handleProfileOverlayKeydown(e, dialog, onCancel);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentName;

  return (
    <div className="profile-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        data-testid="profile-rename-dialog"
      >
        <h2 id={titleId} className="profile-modal-title">
          {t("profiles.onboarding.rename")}
        </h2>
        <p id={hintId} className="profile-modal-body">
          {t("profiles.onboarding.renameTypeImmutable", { type: typeLabel })}
        </p>
        <label className="profile-field">
          <span>{t("profiles.onboarding.name")}</span>
          <input
            ref={inputRef}
            className="profile-focusable"
            data-testid="profile-rename-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                onConfirm(trimmed);
              }
            }}
          />
        </label>
        <div className="profile-modal-actions">
          <button
            type="button"
            className="btn ghost profile-focusable"
            data-testid="profile-rename-cancel"
            onClick={onCancel}
          >
            {t("profiles.rename.cancel")}
          </button>
          <button
            type="button"
            className="btn primary profile-focusable"
            data-testid="profile-rename-save"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              onConfirm(trimmed);
            }}
          >
            {t("profiles.rename.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
