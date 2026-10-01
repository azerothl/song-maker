import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  focusProfileElement,
  handleProfileOverlayKeydown,
} from "../lib/profileDialogA11y";
import {
  PROFILE_NAME_MAX_LENGTH,
  profileNameCharCount,
  profileNamesCollide,
} from "../lib/profileRenameValidation";
import { t } from "../ui/i18n";

export { PROFILE_NAME_MAX_LENGTH };

type Props = {
  open: boolean;
  currentName: string;
  typeLabel: string;
  /** Other profile names (case-insensitive duplicate check). */
  existingNames?: readonly string[];
  /** Element to restore focus to when the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: (nextName: string) => void;
  onCancel: () => void;
};

/** Accessible rename dialog — replaces `window.prompt` (#212 polish). */
export function ProfileRenameDialog({
  open,
  currentName,
  typeLabel,
  existingNames = [],
  returnFocusRef,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  const wasOpenRef = useRef(false);
  const [draft, setDraft] = useState(currentName);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    setDraft(currentName);
    setSubmitAttempted(false);
  }, [open, currentName]);

  // Focus once when opening; do not re-grab on parent re-renders (#212 reserve).
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
      focusProfileElement(inputRef.current);
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

  const trimmed = draft.trim();
  const tooLong = profileNameCharCount(trimmed) > PROFILE_NAME_MAX_LENGTH;
  const empty = trimmed.length === 0;
  const duplicate = existingNames.some(
    (n) =>
      profileNamesCollide(n, trimmed) && !profileNamesCollide(n, currentName),
  );
  const unchanged = trimmed === currentName;
  const errorMessage = empty
    ? t("profiles.rename.error.empty")
    : tooLong
      ? t("profiles.rename.error.tooLong", { max: String(PROFILE_NAME_MAX_LENGTH) })
      : duplicate
        ? t("profiles.rename.error.duplicate")
        : null;
  const showError = Boolean(errorMessage) && (submitAttempted || duplicate || tooLong);
  const canSave = !empty && !tooLong && !duplicate && !unchanged;

  const trySave = () => {
    setSubmitAttempted(true);
    if (!canSave) return;
    onConfirm(trimmed);
  };

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
            maxLength={PROFILE_NAME_MAX_LENGTH}
            aria-invalid={showError && Boolean(errorMessage) ? true : undefined}
            aria-describedby={showError && errorMessage ? errorId : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                trySave();
              }
            }}
          />
        </label>
        {showError && errorMessage ? (
          <p
            id={errorId}
            className="profile-rename-error"
            role="alert"
            data-testid="profile-rename-error"
          >
            {errorMessage}
          </p>
        ) : null}
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
            onClick={trySave}
          >
            {t("profiles.rename.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
