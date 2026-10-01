import {
  DEFAULT_RETENTION_POLICY,
  type BuiltRemotePayload,
  type RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import { t } from "../ui/i18n";

export type RemoteGenerateConfirmProps = {
  open: boolean;
  prefs: RemoteWorkerPreferences;
  /** Hashed payload preview (from buildProjectPayload). */
  payloadPreview: BuiltRemotePayload | null;
  busy?: boolean;
  onCancel: () => void;
  /** User explicitly consents for this send. */
  onConfirm: () => void | Promise<void>;
};

/**
 * Consent + retention preview before any remote submit.
 * SongScreen: show when prefs.remoteEnabled; never auto-fallback to local on confirm failure.
 */
export function RemoteGenerateConfirm({
  open,
  prefs,
  payloadPreview,
  busy,
  onCancel,
  onConfirm,
}: RemoteGenerateConfirmProps) {
  if (!open) return null;

  const bytes = payloadPreview?.blob.byteLength ?? 0;
  const sha = payloadPreview?.plaintextSha256?.slice(0, 16) ?? "—";

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal remote-generate-confirm"
        role="dialog"
        aria-labelledby="remote-confirm-title"
        aria-modal="true"
      >
        <h2 id="remote-confirm-title">{t("phase4.remote.confirmTitle")}</h2>
        <p className="hint">{DEFAULT_RETENTION_POLICY.messageFr}</p>
        <p className="hint">{t("phase4.remote.confirmNoFallback")}</p>
        <dl className="kv">
          <dt>{t("phase4.remote.endpoint")}</dt>
          <dd className="mono">{prefs.endpointBaseUrl || t("phase4.remote.endpointMissing")}</dd>
          <dt>{t("phase4.remote.payloadBytes")}</dt>
          <dd>{bytes > 0 ? `${bytes} octets` : "—"}</dd>
          <dt>{t("phase4.remote.payloadSha")}</dt>
          <dd className="mono">{sha}…</dd>
          <dt>{t("phase4.remote.encryption")}</dt>
          <dd>{payloadPreview?.blob.encryption ?? "—"}</dd>
        </dl>
        {!prefs.retentionAcknowledged && (
          <p className="hint error">{t("phase4.remote.needRetention")}</p>
        )}
        <div className="btn-row">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {t("phase4.remote.confirmCancel")}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              busy ||
              !prefs.remoteEnabled ||
              !prefs.retentionAcknowledged ||
              !prefs.endpointBaseUrl.trim() ||
              !payloadPreview
            }
            onClick={() => void onConfirm()}
          >
            {t("phase4.remote.confirmSend")}
          </button>
        </div>
      </div>
    </div>
  );
}
