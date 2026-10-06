import { useEffect, useMemo, useState } from "react";
import {
  MemoryTrainingJobStore,
  cancelTrainingJob,
  cleanupTrainingJob,
  formatFromPath,
  launchTrainingJob,
  readTrainingLogs,
  validateCorpus,
  type CorpusValidationIssue,
  type CorpusSong,
  type LaunchTrainingResult,
  type TrainingJobStore,
} from "@song-maker/lora-training";
import {
  loraTrainStatusLabelKey,
  resolveLoraTrainRuntimeStatus,
  type LoraTrainRuntimeStatus,
} from "../lib/loraTrainStatus";
import {
  isTauriRuntime,
  runtimeApi,
  type LoraTrainerProbe,
} from "../lib/runtimeHost";
import { t } from "../ui/i18n";

type FileMeta = {
  name: string;
  path: string;
  size: number;
  durationMs: number;
  contentSha256: string | null;
};

function corpusIssueMessage(
  issue: CorpusValidationIssue,
  songs: CorpusSong[],
): string {
  const title = issue.songId
    ? songs.find((song) => song.songId === issue.songId)?.title ?? ""
    : "";
  switch (issue.code) {
    case "empty_corpus":
      return t("loraTrain.error.emptyCorpus");
    case "missing_audio":
      return t("loraTrain.error.missingAudio", { title });
    case "unsupported_format":
      return t("loraTrain.error.unsupportedFormat", { title });
    case "duration_too_short":
      return t("loraTrain.error.durationTooShort", { title });
    case "duration_too_long":
      return t("loraTrain.error.durationTooLong", { title });
    case "duplicate_hash":
    case "duplicate_path":
      return t("loraTrain.error.duplicate");
    case "insufficient_for_split":
      return t("loraTrain.error.insufficientForSplit");
    default:
      return t("loraTrain.error.generic");
  }
}

function trainingStatusKey(
  status: LaunchTrainingResult["status"],
): Parameters<typeof t>[0] {
  switch (status) {
    case "draft": return "loraTrain.status.draft";
    case "validated": return "loraTrain.status.validated";
    case "queued": return "loraTrain.status.queued";
    case "running": return "loraTrain.status.running";
    case "cancelled": return "loraTrain.status.cancelled";
    case "failed": return "loraTrain.status.failed";
    case "completed": return "loraTrain.status.completed";
    case "not_implemented": return "loraTrain.status.notImplemented";
    case "awaiting_adapter_validation": return "loraTrain.status.awaitingValidation";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function createHostDiskStore(): TrainingJobStore {
  return {
    async mkdir(path: string) {
      await runtimeApi.loraTrainMkdir(path);
    },
    async writeText(path: string, data: string) {
      await runtimeApi.loraTrainWriteText(path, data);
    },
    async exists(path: string) {
      return runtimeApi.loraTrainPathExists(path);
    },
    async remove(path: string) {
      await runtimeApi.loraTrainRemove(path);
    },
    async readText(path: string) {
      return runtimeApi.loraTrainReadText(path);
    },
  };
}

type LoraTrainingPanelProps = {
  /** Shared probe from Settings home so card and detail stay aligned (#75). */
  probe?: LoraTrainerProbe | null;
  probing?: boolean;
  onRuntimeStatusChange?: (status: LoraTrainRuntimeStatus) => void;
};

/**
 * Settings pilot UI for local NAR LoRA training.
 * Persists under Documents/Song Maker/training-jobs and shells out to
 * scripts/lora-train-nar.py when detected.
 */
export function LoraTrainingPanel({
  probe: probeProp,
  probing: probingProp = false,
  onRuntimeStatusChange,
}: LoraTrainingPanelProps = {}) {
  const [kind, setKind] = useState<"nar" | "yue2_gpu">("nar");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorDetail, setActionErrorDetail] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LaunchTrainingResult | null>(
    null,
  );
  const [logLines, setLogLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [localProbe, setLocalProbe] = useState<LoraTrainerProbe | null>(null);
  const [localProbing, setLocalProbing] = useState(probeProp === undefined);
  const [probeError, setProbeError] = useState(false);

  const store = useMemo(() => {
    if (isTauriRuntime()) return createHostDiskStore();
    return new MemoryTrainingJobStore();
  }, []);

  const controlled = probeProp !== undefined;
  const probe = controlled ? (probeProp ?? null) : localProbe;
  const probing = controlled ? probingProp : localProbing;
  const trainerScriptPath =
    kind === "yue2_gpu"
      ? (probe?.yue2GpuTrainerScriptPath ?? "scripts/lora-train-yue2-gpu.py")
      : (probe?.trainerScriptPath ?? "scripts/lora-train-nar.py");
  const trainerExists =
    kind === "yue2_gpu"
      ? Boolean(probe?.yue2GpuTrainerExists ?? probe?.yue2GpuTrainerScriptPath)
      : Boolean(probe?.trainerExists);
  const jobsRoot = probe?.jobsRoot ?? "training-jobs";

  useEffect(() => {
    if (controlled) {
      setProbeError(false);
      setLocalProbing(false);
      return;
    }
    if (!isTauriRuntime()) {
      setLocalProbe(null);
      setProbeError(false);
      setLocalProbing(false);
      return;
    }
    let cancelled = false;
    setLocalProbing(true);
    void (async () => {
      try {
        const next = await runtimeApi.loraTrainProbe();
        if (cancelled) return;
        setLocalProbe(next);
        setProbeError(false);
      } catch {
        if (!cancelled) {
          setLocalProbe(null);
          setProbeError(true);
        }
      } finally {
        if (!cancelled) setLocalProbing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlled, probeProp]);

  const songs: CorpusSong[] = useMemo(
    () =>
      files.map((f, i) => ({
        songId: `song-${i + 1}-${f.name.replace(/\W+/g, "_")}`,
        title: f.name,
        audioPath: f.path || f.name,
        format: formatFromPath(f.name),
        durationMs: f.durationMs,
        contentSha256: f.contentSha256,
      })),
    [files],
  );

  const validation = useMemo(() => validateCorpus(songs), [songs]);
  const runtimeStatus = useMemo(
    () =>
      resolveLoraTrainRuntimeStatus({
        probing,
        hostAvailable: isTauriRuntime(),
        probe,
        rightsConfirmed,
        corpusReady: songs.length > 0 && validation.ok,
        jobStatus: lastResult?.status ?? null,
      }),
    [
      probing,
      probe,
      rightsConfirmed,
      songs.length,
      validation.ok,
      lastResult?.status,
    ],
  );

  useEffect(() => {
    onRuntimeStatusChange?.(runtimeStatus);
  }, [onRuntimeStatusChange, runtimeStatus]);

  const onPickFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: FileMeta[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const file = list.item(i);
      if (!file) continue;
      // Prefer absolute path from webkitRelativePath / path when Tauri exposes it.
      const path =
        (file as File & { path?: string }).path?.trim() || file.name;
      let durationMs = 60_000;
      let contentSha256: string | null = null;
      let size = file.size;
      if (isTauriRuntime() && path && path !== file.name) {
        try {
          const probe = await runtimeApi.loraTrainProbeAudio(path);
          if (probe.exists) {
            size = probe.byteLength;
            contentSha256 = probe.contentSha256;
            if (probe.durationMs != null) durationMs = probe.durationMs;
          }
        } catch {
          /* keep placeholders */
        }
      }
      next.push({
        name: file.name,
        path,
        size,
        durationMs,
        contentSha256,
      });
    }
    setFiles(next);
    setLastResult(null);
    setLogLines([]);
    setNotice(null);
    setActionError(null);
    setActionErrorDetail(null);
  };

  const refreshLogs = async (jobId: string) => {
    const logs = await readTrainingLogs(jobId, store, jobsRoot);
    setLogLines(logs.lines);
  };

  const onLaunch = async () => {
    setBusy(true);
    setNotice(null);
    setActionError(null);
    setActionErrorDetail(null);
    try {
      const result = await launchTrainingJob(
        {
          corpusRoot: files[0]?.path
            ? files[0].path.replace(/[/\\][^/\\]+$/, "") || "(sélection locale)"
            : "(sélection locale)",
          songs,
          rightsConfirmed,
          trainerExists,
          trainerScriptPath,
          jobsRoot,
        },
        store,
      );
      setLastResult(result);
      setNotice(result.messageFr);
      await refreshLogs(result.jobId);

      if (
        result.status === "queued" &&
        trainerExists &&
        isTauriRuntime() &&
        trainerScriptPath
      ) {
        const launched = await runtimeApi.loraTrainLaunch({
          jobId: result.jobId,
          jobDir: result.jobDir,
          trainerScriptPath,
        });
        setNotice(launched.messageFr);
        setLastResult({ ...result, status: launched.status as LaunchTrainingResult["status"] });
        // Poll until process exits
        for (let i = 0; i < 600; i += 1) {
          await new Promise((r) => setTimeout(r, 1000));
          const poll = await runtimeApi.loraTrainPoll(result.jobId);
          await refreshLogs(result.jobId);
          if (poll.status !== "running") {
            setNotice(poll.messageFr);
            setLastResult({
              ...result,
              status: poll.status as LaunchTrainingResult["status"],
            });
            break;
          }
        }
      }
    } catch (error) {
      setActionError(t("loraTrain.error.actionFailed"));
      setActionErrorDetail(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!lastResult || busy) return;
    setBusy(true);
    setActionError(null);
    setActionErrorDetail(null);
    try {
      if (isTauriRuntime()) {
        const r = await runtimeApi.loraTrainCancelProcess(lastResult.jobId);
        setNotice(r.messageFr);
      }
      const r = await cancelTrainingJob(lastResult.jobId, store, jobsRoot);
      setNotice(r.messageFr);
      await refreshLogs(lastResult.jobId);
    } catch (error) {
      setActionError(t("loraTrain.error.actionFailed"));
      setActionErrorDetail(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const onCleanup = async () => {
    if (!lastResult || busy) return;
    setBusy(true);
    setActionError(null);
    setActionErrorDetail(null);
    try {
      const r = await cleanupTrainingJob(lastResult.jobId, store, jobsRoot);
      setNotice(r.messageFr);
      setLastResult(null);
      setLogLines([]);
    } catch (error) {
      setActionError(t("loraTrain.error.actionFailed"));
      setActionErrorDetail(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lora-training-panel" aria-labelledby="lora-train-title">
      <h2 id="lora-train-title">{t("loraTrain.title")}</h2>
      <p className="hint">{t("loraTrain.intro")}</p>
      <fieldset className="settings-engine-options">
        <legend>{t("loraTrain.kind")}</legend>
        <label className="settings-engine-option">
          <input
            type="radio"
            name="lora-train-kind"
            checked={kind === "nar"}
            onChange={() => setKind("nar")}
          />
          <span>
            <strong>{t("loraTrain.kind.nar")}</strong>
            <small>{t("loraTrain.kind.narHint")}</small>
          </span>
        </label>
        <label className="settings-engine-option">
          <input
            type="radio"
            name="lora-train-kind"
            checked={kind === "yue2_gpu"}
            onChange={() => setKind("yue2_gpu")}
          />
          <span>
            <strong>{t("loraTrain.kind.gpu")}</strong>
            <small>{t("loraTrain.kind.gpuHint")}</small>
          </span>
        </label>
      </fieldset>
      {kind === "yue2_gpu" && probe?.cudaAvailable === false ? (
        <p className="hint warn" role="status">
          {t("loraTrain.kind.gpuNoCuda")}
        </p>
      ) : null}
      <p className="hint" role="status">
        {t("loraTrain.runtimeStatus")}:{" "}
        <strong>{t(loraTrainStatusLabelKey(runtimeStatus))}</strong>
      </p>
      <p className="hint">{t("loraTrain.rightsHint")}</p>
      {probeError && (
        <p className="hint error" role="alert">
          {t("loraTrain.error.probeFailed")}
        </p>
      )}

      <label className="phase3-check">
        <input
          type="checkbox"
          checked={rightsConfirmed}
          onChange={(e) => setRightsConfirmed(e.target.checked)}
        />
        {t("loraTrain.rights")}
      </label>

      <label className="invariant-level">
        {t("loraTrain.corpus")}
        <input
          type="file"
          accept="audio/*,.wav,.flac,.mp3,.ogg"
          multiple
          onChange={(e) => void onPickFiles(e.target.files)}
        />
      </label>
      <p className="hint">
        {t("loraTrain.corpusCount", { count: String(files.length) })}
      </p>
      {!validation.ok && songs.length > 0 && (
        <ul className="hint error">
          {validation.issues.map((issue) => (
            <li key={`${issue.code}-${issue.songId ?? ""}`}>
              {corpusIssueMessage(issue, songs)}
            </li>
          ))}
        </ul>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={
            busy ||
            !rightsConfirmed ||
            songs.length === 0 ||
            !validation.ok ||
            (kind === "yue2_gpu" && probe?.cudaAvailable === false)
          }
          onClick={() => void onLaunch()}
        >
          {kind === "yue2_gpu" ? t("loraTrain.launchGpu") : t("loraTrain.launch")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !lastResult}
          onClick={() => void onCancel()}
        >
          {t("loraTrain.cancel")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy || !lastResult}
          onClick={() => void onCleanup()}
        >
          {t("loraTrain.cleanup")}
        </button>
      </div>
      {actionError && (
        <p
          className="hint error"
          role="alert"
          data-testid="lora-train-action-error"
        >
          {actionError}
        </p>
      )}

      {lastResult && (
        <p className="hint">
          {t("loraTrain.trainingStatus", {
            status: t(trainingStatusKey(lastResult.status)),
          })}
        </p>
      )}
      {(notice || lastResult || logLines.length > 0 || actionErrorDetail) && (
        <details>
          <summary>{t("loraTrain.supportDetails")}</summary>
          {actionErrorDetail && (
            <pre className="phase3-download-notice">{actionErrorDetail}</pre>
          )}
          {lastResult && (
            <p className="hint">
              {t("loraTrain.trainingId", { id: lastResult.jobId })}
            </p>
          )}
          <p className="hint">
            {t("loraTrain.jobsRoot")}: {jobsRoot}
          </p>
          {notice && <pre className="phase3-download-notice">{notice}</pre>}
          {logLines.length > 0 && (
            <pre className="phase3-download-notice">{logLines.join("\n")}</pre>
          )}
        </details>
      )}
    </section>
  );
}
