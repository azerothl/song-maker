import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  type BatchError,
  type BatchPreview,
  type BatchSnapshot,
  type BatchTask,
} from "../lib/api";
import { generationErrorMessage } from "../lib/generationError";
import { isTauriRuntime } from "../lib/runtimeHost";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import { TakePreviewPlayer } from "./TakePreviewPlayer";

function taskLabel(state: string): string {
  switch (state) {
    case "queued":
      return t("batch.task.queued");
    case "preparing":
      return t("batch.task.preparing");
    case "running":
      return t("batch.task.running");
    case "publishing":
      return t("batch.task.publishing");
    case "succeeded":
      return t("batch.task.succeeded");
    case "failed":
      return t("batch.task.failed");
    case "interrupted":
      return t("batch.task.interrupted");
    case "cancelled":
      return t("batch.task.cancelled");
    case "cancel_requested":
      return t("batch.task.cancel_requested");
    case "retry_wait":
      return t("batch.task.retry_wait");
    default: {
      const _exhaustive: string = state;
      return _exhaustive;
    }
  }
}

function lotLabel(state: string): string {
  switch (state) {
    case "running":
      return t("batch.lot.running");
    case "pausing":
      return t("batch.lot.pausing");
    case "paused":
      return t("batch.lot.paused");
    case "cancelling":
      return t("batch.lot.cancelling");
    case "cancelled":
      return t("batch.lot.cancelled");
    case "completed":
      return t("batch.lot.completed");
    case "completed_with_errors":
      return t("batch.lot.completed_with_errors");
    case "interrupted":
      return t("batch.lot.interrupted");
    case "failed":
      return t("batch.lot.failed");
    default:
      return state;
  }
}

function batchErrorFieldLabel(field: string): string {
  switch (field) {
    case "title": return t("batch.error.field.title");
    case "style": return t("batch.error.field.style");
    case "lyrics": return t("batch.error.field.lyrics");
    case "targetDurationSec": return t("batch.error.field.duration");
    case "generations": return t("batch.error.field.generations");
    case "tempoBpm": return t("batch.error.field.tempo");
    case "singingLanguage": return t("batch.error.field.language");
    case "instrumentalMode": return t("batch.error.field.instrumental");
    case "preferFullLyrics": return t("batch.error.field.lyricsPreference");
    case "key": return t("batch.error.field.key");
    case "meter": return t("batch.error.field.meter");
    default: return t("batch.error.field.songSettings");
  }
}

function batchSongErrorHint(field: string, error: BatchError): string {
  if (field === "title") return t("batch.error.invalidTitle");
  if (field === "style") return t("batch.error.invalidStyle");
  if (field === "lyrics") return t("batch.error.invalidLyrics");
  if (field === "targetDurationSec") return t("batch.error.invalidDuration");
  if (field === "generations") return t("batch.error.invalidGenerations");
  if (field === "tempoBpm") return t("batch.error.invalidTempo");
  if (field === "singingLanguage") return t("batch.error.invalidLanguage");
  if (field === "id" && error.messageFr.includes("dupliqué")) return t("batch.error.duplicateId");
  if (field === "id") return t("batch.error.invalidId");
  if (field === "seed") return t("batch.error.invalidSeed");
  if (field === "key" || field === "meter") return t("batch.error.invalidMusicSetting");
  return t("batch.error.invalidSongSetting");
}

function presentBatchError(error: BatchError): { location: string; message: string } {
  const songPath = /^songs\[(\d+)\]\.([^.]+)$/.exec(error.path);
  if (songPath) {
    const field = songPath[2];
    return {
      location: t("batch.error.songLocation", {
        number: Number(songPath[1]) + 1,
        field: batchErrorFieldLabel(field),
      }),
      message: batchSongErrorHint(field, error),
    };
  }

  const lowerMessage = error.messageFr.toLowerCase();
  if (error.path === "$" || error.path.startsWith("$:") || error.path.startsWith("$.")) {
    const message = lowerMessage.includes("volumineux")
      ? t("batch.error.fileTooLarge")
      : lowerMessage.includes("utf-8")
        ? t("batch.error.fileEncoding")
        : t("batch.error.invalidFile");
    return { location: t("batch.error.fileLocation"), message };
  }
  if (error.path === "songs") {
    const message = lowerMessage.includes("au moins")
      ? t("batch.error.noSongs")
      : lowerMessage.includes("1000 morceaux")
        ? t("batch.error.tooManySongs")
        : t("batch.error.tooManyTakes");
    return { location: t("batch.error.songsLocation"), message };
  }
  if (error.path === "name") {
    return { location: t("batch.error.fileNameLocation"), message: t("batch.error.invalidFileName") };
  }
  return { location: t("batch.error.fileLocation"), message: t("batch.error.invalidFileSettings") };
}

export function BatchGenerationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setError = useAppStore((s) => s.setError);
  const openProject = useAppStore((s) => s.openProject);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [errors, setErrors] = useState<BatchError[]>([]);
  const [batches, setBatches] = useState<BatchSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [generations, setGenerations] = useState<number>(3);
  const [parallel, setParallel] = useState<number>(2);
  const [previewDirty, setPreviewDirty] = useState(false);

  const refreshBatches = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      setBatches(await api.listBatches());
    } catch (e) {
      setError(String(e));
    }
  }, [setError]);

  useEffect(() => {
    if (!open) return;
    void refreshBatches();
  }, [open, refreshBatches]);

  useEffect(() => {
    if (!open || !isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<BatchSnapshot>("batch-updated", (event) => {
      const snap = event.payload;
      setBatches((prev) => {
        const rest = prev.filter((b) => b.batchId !== snap.batchId);
        return [snap, ...rest];
      });
      void refreshLibrary();
    }).then((release) => {
      unlisten = release;
    });
    const timer = window.setInterval(() => {
      void refreshBatches();
    }, 2500);
    return () => {
      unlisten?.();
      window.clearInterval(timer);
    };
  }, [open, refreshBatches, refreshLibrary]);

  async function onImport() {
    setError(null);
    setBusy(true);
    setNotice(null);
    setErrors([]);
    try {
      const result = await api.validateBatchImport();
      if (result.cancelled) return;
      if (!result.ok) {
        setPreview(null);
        setErrors(result.errors ?? []);
        return;
      }
      if (result.preview) {
        setPreview(result.preview);
        setPreviewDirty(false);
        setParallel(result.preview.requestedParallel);
        const common = result.preview.songs[0]?.generations ?? 1;
        setGenerations(common);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onOverride() {
    if (!preview) return;
    setBusy(true);
    setErrors([]);
    try {
      const result = await api.updateBatchPreview(preview.startToken, {
        generations,
        maxParallelGenerations: parallel,
      });
      if (!result.ok) {
        setErrors(result.errors ?? []);
        return;
      }
      if (result.preview) {
        setPreview(result.preview);
        setPreviewDirty(false);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLaunch() {
    if (!preview || previewDirty) return;
    setBusy(true);
    setErrors([]);
    setNotice(t("batch.starting"));
    try {
      await api.startBatch(preview.startToken, preview.revision);
      setPreview(null);
      setNotice(null);
      await refreshBatches();
      await refreshLibrary();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyParallelism() {
    if (!preview) return;
    setError(null);
    setBusy(true);
    setNotice(t("batch.verifyRunning"));
    try {
      const result = await api.verifyBatchParallelism(preview.startToken);
      if (result.preview) setPreview(result.preview);
      setNotice(result.messageFr);
      await refreshLibrary();
    } catch (error) {
      setNotice(null);
      setError(String(error));
    } finally { setBusy(false); }
  }

  async function onRetry(batch: BatchSnapshot) {
    const ids = (batch.tasks ?? [])
      .filter((task) => task.state === "failed" || task.state === "interrupted")
      .map((task) => task.taskId);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.retryBatchTasks(batch.batchId, ids);
      await refreshBatches();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <section className="batch-panel" aria-labelledby="batch-title">
      <header className="batch-panel-header">
        <h2 id="batch-title">{t("batch.title")}</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("batch.close")}
        </button>
      </header>
      <p className="hint">{t("batch.honest")}</p>
      <div className="batch-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void onImport()}>
          {t("batch.import")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() =>
            void api
              .downloadBatchExample()
              .then((path) => {
                if (path) setNotice(path);
              })
              .catch((e) => setError(String(e)))
          }
        >
          {t("batch.example")}
        </button>
      </div>
      {notice && <p className="hint">{notice}</p>}
      {errors.length > 0 && (
        <div className="batch-errors" role="alert">
          <p>{t("batch.errors")}</p>
          <ul>
            {errors.map((err) => {
              const presented = presentBatchError(err);
              return (
                <li key={`${err.path}:${err.messageFr}`}>
                  <strong>{presented.location} :</strong> {presented.message}
                </li>
              );
            })}
          </ul>
          <p>{t("batch.error.importHelp")}</p>
          <details>
            <summary>{t("batch.error.supportDetails")}</summary>
            <ul>
              {errors.map((err) => (
                <li key={`support:${err.path}:${err.messageFr}`}>{err.path} : {err.messageFr}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {preview && (
        <div className="batch-preview">
          <p>
            {t("batch.summary", {
              songs: preview.songCount,
              tasks: preview.taskCount,
              requested: preview.requestedParallel,
              admitted: preview.admittedParallel,
            })}
          </p>
          <p className="hint">
            {preview.admittedParallel === 1 ? t("batch.capacityOne") : `${t("batch.capacity")} : ${preview.capacityReasonFr}`}
          </p>
          <button type="button" className="btn" disabled={busy || previewDirty || preview.taskCount < 2} onClick={() => void onVerifyParallelism()}>
            {t("batch.verifyParallel")}
          </button>
          <p className="hint">{t("batch.verifyHint")}</p>
          {preview.launchBlockFr && <p className="hint">{preview.launchBlockFr}</p>}
          <label>
            {t("batch.generations")}
            <input
              type="number"
              min={1}
              max={1000}
              value={generations}
              disabled={busy}
              onChange={(e) => { setGenerations(Number(e.target.value) || 1); setPreviewDirty(true); }}
            />
          </label>
          <label>
            {t("batch.parallel")}
            <input
              type="number"
              min={1}
              max={32}
              value={parallel}
              disabled={busy}
              onChange={(e) => { setParallel(Number(e.target.value) || 1); setPreviewDirty(true); }}
            />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void onOverride()}>{t("batch.refreshPreview")}</button>
          {previewDirty && <p className="hint" role="status">{t("batch.refreshRequired")}</p>}
          <h3>{t("batch.songs")}</h3>
          <ul>
            {preview.songs.map((song) => (
              <li key={song.id}>
                {song.title} · {song.generations} · {song.stylePreview}
                <details>
                  <summary>{t("batch.songDetails")}</summary>
                  <p>{song.style ?? song.stylePreview}</p>
                  {song.instrumentalMode ? <p>{t("batch.instrumentalLyrics")}</p> : <pre className="batch-lyrics">{song.lyrics ?? t("batch.lyricsUnavailable")}</pre>}
                </details>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn primary"
            disabled={busy || previewDirty || !preview.canLaunch}
            onClick={() => void onLaunch()}
          >
            {t("batch.launch")}
          </button>
        </div>
      )}
      {batches.length === 0 && !preview ? (
        <p className="empty">{t("batch.empty")}</p>
      ) : (
        batches.map((batch) => (
          <article key={batch.batchId} className="batch-lot">
            <header>
              <h3>
                {batch.name} · {lotLabel(batch.state)}
              </h3>
              {batch.counts && (
                <p>
                  {t("batch.done", {
                    ready: batch.counts.ready,
                    failed: batch.counts.failed,
                    interrupted: batch.counts.interrupted,
                    cancelled: batch.counts.cancelled,
                    total: batch.counts.total,
                  })}
                  {" · "}
                  {t("batch.state.running")}{" "}
                  {batch.counts.running} · {t("batch.state.queued")} {batch.counts.queued}
                </p>
              )}
              <p>{t("batch.liveParallel", { count: batch.effectiveParallel ?? 1 })}</p>
              {(batch.effectiveParallel ?? 1) < (batch.requestedParallel ?? 1) && batch.capacityReasonFr && (
                <p className="hint">{batch.capacityReasonFr}</p>
              )}
            </header>
            <div className="batch-actions">
              {batch.state === "running" || batch.state === "pausing" ? (
                <button type="button" className="btn" onClick={() => void api.pauseBatch(batch.batchId).catch((e) => setError(String(e)))}>
                  {t("batch.pause")}
                </button>
              ) : null}
              {batch.state === "paused" || batch.state === "interrupted" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void api.resumeBatch(batch.batchId).catch((e) => setError(String(e)))}
                >
                  {t("batch.resume")}
                </button>
              ) : null}
              {batch.state !== "cancelled" &&
              batch.state !== "completed" &&
              batch.state !== "completed_with_errors" ? (
                <button type="button" className="btn" onClick={() => void api.cancelBatch(batch.batchId).catch((e) => setError(String(e)))}>
                  {t("batch.cancel")}
                </button>
              ) : null}
              <button type="button" className="btn" disabled={busy || !(batch.tasks ?? []).some(task => task.state === "failed" || task.state === "interrupted")} title={t("batch.retryHint")} onClick={() => void onRetry(batch)}>
                {t("batch.retryFailed")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !(batch.tasks ?? []).some(task => task.state === "succeeded")}
                title={t("batch.exportHint")}
                onClick={() =>
                  void api
                    .exportBatchResults(batch.batchId)
                    .then((path) => {
                      if (path) setNotice(path);
                    })
                    .catch((e) => setError(String(e)))
                }
              >
                {t("batch.export")}
              </button>
            </div>
            <h4>{t("batch.takes")}</h4>
            <ul className="batch-tasks">
              {(batch.tasks ?? []).map((task) => (
                <BatchTaskRow
                  key={task.taskId}
                  task={task}
                  onCancel={() => api.cancelBatchTask(batch.batchId, task.taskId).then(() => undefined)}
                  onOpen={() => {
                    if (task.projectId) void openProject(task.projectId);
                  }}
                />
              ))}
            </ul>
          </article>
        ))
      )}
    </section>
  );
}

export function BatchTaskRow({ task, onOpen, onCancel }: { task: BatchTask; onOpen: () => void; onCancel?: () => Promise<void> }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canCancel = ["queued", "retry_wait", "preparing", "running", "publishing"].includes(task.state);
  return (
    <li>
      <span>
        {task.title} · {t("batch.takeNumber", { number: task.variantIndex })} · {taskLabel(task.state)}
      </span>
      {task.lastError && (
        <details className="hint">
          <summary>{t("batch.errorDetails")}</summary>
          <p>{generationErrorMessage(task.lastError)}</p>
        </details>
      )}
      {canCancel && onCancel && (
        <button type="button" className="linkish" disabled={cancelling}
          aria-label={t("batch.cancelTakeLabel", { title: task.title, number: task.variantIndex })}
          onClick={() => {
            setCancelling(true);
            void onCancel().catch(error => useAppStore.getState().setError(String(error)))
              .finally(() => setCancelling(false));
          }}>
          {t("batch.cancelTake")}
        </button>
      )}
      {task.state === "succeeded" && task.projectId && (
        <span className="batch-task-actions">
          <button type="button" className="linkish" disabled={!task.audioPath} aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>
            {t("batch.listen")}
          </button>
          <button type="button" className="linkish" onClick={onOpen}>
            {t("batch.openSong")}
          </button>
          <button type="button" className="linkish" onClick={() => void api.revealProject(task.projectId!).catch(error => useAppStore.getState().setError(String(error)))}>
            {t("batch.showFolder")}
          </button>
        </span>
      )}
      {previewOpen && task.audioPath && <TakePreviewPlayer audioPath={task.audioPath} label={`${task.title} · ${task.variantIndex}`} />}
    </li>
  );
}
