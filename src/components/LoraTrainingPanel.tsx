import { useEffect, useMemo, useState } from "react";
import {
  MemoryTrainingJobStore,
  QUALITY_DISCLAIMER_FR,
  RIGHTS_DISCLAIMER_FR,
  cancelTrainingJob,
  cleanupTrainingJob,
  estimateTrainingResources,
  formatFromPath,
  launchTrainingJob,
  readTrainingLogs,
  validateCorpus,
  type CorpusSong,
  type LaunchTrainingResult,
  type TrainingJobStore,
} from "@song-maker/lora-training";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { t } from "../ui/i18n";

type FileMeta = {
  name: string;
  path: string;
  size: number;
  durationMs: number;
  contentSha256: string | null;
};

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

/**
 * Settings pilot UI for local NAR LoRA training.
 * Persists under Documents/Song Maker/training-jobs and shells out to
 * scripts/lora-train-nar.py when detected.
 */
export function LoraTrainingPanel() {
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LaunchTrainingResult | null>(
    null,
  );
  const [logLines, setLogLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [trainerExists, setTrainerExists] = useState(false);
  const [trainerScriptPath, setTrainerScriptPath] = useState(
    "scripts/lora-train-nar.py",
  );
  const [jobsRoot, setJobsRoot] = useState("training-jobs");
  const [probeNote, setProbeNote] = useState<string | null>(null);

  const store = useMemo(() => {
    if (isTauriRuntime()) return createHostDiskStore();
    return new MemoryTrainingJobStore();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setProbeNote(
        "Hôte Tauri requis pour persistance disque et lancement du trainer.",
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const probe = await runtimeApi.loraTrainProbe();
        if (cancelled) return;
        setTrainerExists(probe.trainerExists);
        if (probe.trainerScriptPath) {
          setTrainerScriptPath(probe.trainerScriptPath);
        }
        setJobsRoot(probe.jobsRoot);
        setProbeNote(probe.messageFr);
      } catch (e) {
        if (!cancelled) {
          setProbeNote(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const estimate = useMemo(
    () => estimateTrainingResources(songs),
    [songs],
  );

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
  };

  const refreshLogs = async (jobId: string) => {
    const logs = await readTrainingLogs(jobId, store, jobsRoot);
    setLogLines(logs.lines);
  };

  const onLaunch = async () => {
    setBusy(true);
    setNotice(null);
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
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!lastResult) return;
    if (isTauriRuntime()) {
      const r = await runtimeApi.loraTrainCancelProcess(lastResult.jobId);
      setNotice(r.messageFr);
    }
    const r = await cancelTrainingJob(lastResult.jobId, store, jobsRoot);
    setNotice(r.messageFr);
    await refreshLogs(lastResult.jobId);
  };

  const onCleanup = async () => {
    if (!lastResult) return;
    const r = await cleanupTrainingJob(lastResult.jobId, store, jobsRoot);
    setNotice(r.messageFr);
    setLastResult(null);
    setLogLines([]);
  };

  return (
    <section className="lora-training-panel" aria-labelledby="lora-train-title">
      <h2 id="lora-train-title">{t("loraTrain.title")}</h2>
      <p className="hint">{t("loraTrain.intro")}</p>
      <p className="hint warn" role="note">
        {QUALITY_DISCLAIMER_FR}
      </p>
      <p className="hint">{RIGHTS_DISCLAIMER_FR}</p>
      {probeNote && <p className="hint">{probeNote}</p>}
      <p className="hint">
        {t("loraTrain.jobsRoot")}: {jobsRoot}
      </p>

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
              {issue.messageFr}
            </li>
          ))}
        </ul>
      )}

      <dl className="kv">
        <dt>{t("loraTrain.estimate.vram")}</dt>
        <dd>
          ~{Math.round(estimate.vramMib / 1024)} GiB{" "}
          <span className="hint">({t("loraTrain.estimate.unmeasured")})</span>
        </dd>
        <dt>{t("loraTrain.estimate.disk")}</dt>
        <dd>
          ~{Math.round(estimate.diskMib / 1024)} GiB{" "}
          <span className="hint">({t("loraTrain.estimate.unmeasured")})</span>
        </dd>
        <dt>{t("loraTrain.estimate.duration")}</dt>
        <dd>
          ~{estimate.durationMinutes} min{" "}
          <span className="hint">({t("loraTrain.estimate.unmeasured")})</span>
        </dd>
      </dl>
      <p className="hint">{estimate.noteFr}</p>
      <p className="hint">{t("loraTrain.noAutoActivate")}</p>

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={
            busy || !rightsConfirmed || songs.length === 0 || !validation.ok
          }
          onClick={() => void onLaunch()}
        >
          {t("loraTrain.launch")}
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

      {lastResult && (
        <p className="hint">
          {t("loraTrain.jobStatus", {
            id: lastResult.jobId,
            status: lastResult.status,
          })}
        </p>
      )}
      {notice && <pre className="phase3-download-notice">{notice}</pre>}
      {logLines.length > 0 && (
        <details>
          <summary>{t("loraTrain.logs")}</summary>
          <pre className="phase3-download-notice">{logLines.join("\n")}</pre>
        </details>
      )}
    </section>
  );
}
