import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  type BatchPreview,
  type BatchSnapshot,
  type BatchTask,
} from "../lib/api";
import { isTauriRuntime } from "../lib/runtimeHost";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

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

export function BatchGenerationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setError = useAppStore((s) => s.setError);
  const openProject = useAppStore((s) => s.openProject);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [errors, setErrors] = useState<{ path: string; messageFr: string }[]>([]);
  const [batches, setBatches] = useState<BatchSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [generations, setGenerations] = useState<number>(3);
  const [parallel, setParallel] = useState<number>(2);

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
    try {
      const result = await api.updateBatchPreview(preview.startToken, {
        generations,
        maxParallelGenerations: parallel,
      });
      if (!result.ok) {
        setErrors(result.errors ?? []);
        return;
      }
      if (result.preview) setPreview(result.preview);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLaunch() {
    if (!preview) return;
    setBusy(true);
    try {
      const planned = await api.updateBatchPreview(preview.startToken, {
        generations,
        maxParallelGenerations: parallel,
      });
      const next = planned.preview ?? preview;
      if (!planned.ok || !next.canLaunch) {
        setErrors(planned.errors ?? []);
        if (planned.preview) setPreview(planned.preview);
        return;
      }
      setPreview(next);
      await api.startBatch(next.startToken, next.revision);
      setPreview(null);
      await refreshBatches();
      await refreshLibrary();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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
            {errors.map((err) => (
              <li key={`${err.path}:${err.messageFr}`}>
                {err.path} : {err.messageFr}
              </li>
            ))}
          </ul>
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
            {t("batch.capacity")} : {preview.capacityReasonFr}
          </p>
          {preview.launchBlockFr && <p className="hint">{preview.launchBlockFr}</p>}
          <label>
            {t("batch.generations")}
            <input
              type="number"
              min={1}
              max={1000}
              value={generations}
              onChange={(e) => setGenerations(Number(e.target.value) || 1)}
              onBlur={() => void onOverride()}
            />
          </label>
          <label>
            {t("batch.parallel")}
            <input
              type="number"
              min={1}
              max={32}
              value={parallel}
              onChange={(e) => setParallel(Number(e.target.value) || 1)}
              onBlur={() => void onOverride()}
            />
          </label>
          <h3>{t("batch.songs")}</h3>
          <ul>
            {preview.songs.map((song) => (
              <li key={song.id}>
                {song.title} · {song.generations} · {song.stylePreview}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !preview.canLaunch}
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
                    total: batch.counts.total,
                  })}
                  {" · "}
                  {t("batch.state.ready")} {batch.counts.ready} · {t("batch.state.running")}{" "}
                  {batch.counts.running} · {t("batch.state.queued")} {batch.counts.queued}
                </p>
              )}
            </header>
            <div className="batch-actions">
              {batch.state === "running" || batch.state === "pausing" ? (
                <button type="button" className="btn" onClick={() => void api.pauseBatch(batch.batchId)}>
                  {t("batch.pause")}
                </button>
              ) : null}
              {batch.state === "paused" || batch.state === "interrupted" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void api.resumeBatch(batch.batchId)}
                >
                  {t("batch.resume")}
                </button>
              ) : null}
              {batch.state !== "cancelled" &&
              batch.state !== "completed" &&
              batch.state !== "completed_with_errors" ? (
                <button type="button" className="btn" onClick={() => void api.cancelBatch(batch.batchId)}>
                  {t("batch.cancel")}
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => void onRetry(batch)}>
                {t("batch.retryFailed")}
              </button>
              <button
                type="button"
                className="btn"
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

function BatchTaskRow({ task, onOpen }: { task: BatchTask; onOpen: () => void }) {
  return (
    <li>
      <span>
        {task.title} · {task.songId}/{task.variantIndex} · {taskLabel(task.state)}
        {task.lastError ? ` — ${task.lastError}` : ""}
      </span>
      {task.state === "succeeded" && task.projectId && (
        <span className="batch-task-actions">
          <button type="button" className="linkish" onClick={onOpen}>
            {t("batch.listen")}
          </button>
          <button type="button" className="linkish" onClick={onOpen}>
            {t("batch.openSong")}
          </button>
        </span>
      )}
    </li>
  );
}
