import type { CommercialProfileCreationConfirm } from "@song-maker/stem-providers";
import { t } from "../ui/i18n";

type Props = {
  open: boolean;
  confirm: CommercialProfileCreationConfirm;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ProfileCommercialCreateConfirmDialog({
  open,
  confirm,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="profile-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="commercial-create-confirm-title"
      data-testid="profile-commercial-create-confirm"
    >
      <div className="profile-modal">
        <h2 id="commercial-create-confirm-title" className="profile-modal-title">
          {confirm.titleFr}
        </h2>
        <p>{confirm.introFr}</p>
        <ul className="profile-commercial-create-engines">
          {confirm.engineLinesFr.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="profile-modal-actions">
          <button type="button" className="btn ghost profile-focusable" onClick={onCancel}>
            {t("profiles.commercial.createConfirm.cancel")}
          </button>
          <button
            type="button"
            className="btn primary profile-focusable"
            data-testid="profile-commercial-create-confirm-submit"
            onClick={onConfirm}
          >
            {t("profiles.commercial.createConfirm.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
