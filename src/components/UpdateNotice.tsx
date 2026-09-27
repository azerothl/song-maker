import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";

export function UpdateNotice({
  update,
  onDismiss,
}: {
  update: Update;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [contentLength, setContentLength] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    setError(null);
    setDownloaded(0);
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength);
        } else if (event.event === "Progress") {
          setDownloaded((current) => current + event.data.chunkLength);
        }
      });
      await relaunch();
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  }

  const percent = contentLength
    ? Math.min(100, Math.round((downloaded / contentLength) * 100))
    : 0;

  return (
    <section className="update-notice" role="status" aria-live="polite">
      <div className="update-notice-copy">
        <strong>Song Maker {update.version} est disponible</strong>
        <p>{busy ? "Téléchargement et installation de la mise à jour…" : update.body || "Une nouvelle version de Song Maker est prête à installer."}</p>
        {busy && (
          <div className="update-progress">
            <progress max={100} value={percent} aria-label="Téléchargement de la mise à jour" />
            {contentLength != null && <small>{percent}% · {(downloaded / 1024 ** 2).toFixed(1)} / {(contentLength / 1024 ** 2).toFixed(1)} Mo</small>}
          </div>
        )}
        {error && <small className="update-error" role="alert">Échec de la mise à jour : {error}</small>}
      </div>
      <div className="update-notice-actions">
        <button className="btn primary" type="button" disabled={busy} onClick={() => void install()}>
          {busy ? "Installation…" : "Mettre à jour"}
        </button>
        {!busy && <button className="btn ghost" type="button" onClick={onDismiss}>Plus tard</button>}
      </div>
    </section>
  );
}
