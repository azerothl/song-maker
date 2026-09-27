import { useMemo, useState } from "react";
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
} from "@song-maker/lora-training";
import { t } from "../ui/i18n";

type FileMeta = {
  name: string;
  path: string;
  size: number;
  /** Browser File API has no duration — placeholder until probed. */
  durationMs: number;
};

/**
 * Settings pilot UI for local NAR LoRA training.
 * Validates corpus + writes an in-memory job folder; trainer stays not_implemented
 * unless a host later sets trainerExists after detecting scripts/lora-train-nar.*.
 */
export function LoraTrainingPanel() {
  const store = useMemo(() => new MemoryTrainingJobStore(), []);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LaunchTrainingResult | null>(
    null,
  );
  const [logLines, setLogLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const songs: CorpusSong[] = useMemo(
    () =>
      files.map((f, i) => ({
        songId: `song-${i + 1}-${f.name.replace(/\W+/g, "_")}`,
        title: f.name,
        audioPath: f.path || f.name,
        format: formatFromPath(f.name),
        durationMs: f.durationMs,
        contentSha256: null,
      })),
    [files],
  );

  const validation = useMemo(() => validateCorpus(songs), [songs]);
  const estimate = useMemo(
    () => estimateTrainingResources(songs),
    [songs],
  );

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next: FileMeta[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const file = list.item(i);
      if (!file) continue;
      // Duration unknown in browser without decode — use placeholder 60s for UI demo.
      next.push({
        name: file.name,
        path: file.name,
        size: file.size,
        durationMs: 60_000,
      });
    }
    setFiles(next);
    setLastResult(null);
    setLogLines([]);
    setNotice(null);
  };

  const onLaunch = async () => {
    setBusy(true);
    setNotice(null);
    try {
      // Detect optional trainer script only in environments that can probe disk.
      // Browser/Tauri UI: honest default trainerExists=false.
      const result = await launchTrainingJob(
        {
          corpusRoot: "(sélection locale)",
          songs,
          rightsConfirmed,
          trainerExists: false,
          trainerScriptPath: "scripts/lora-train-nar.py",
        },
        store,
      );
      setLastResult(result);
      setNotice(result.messageFr);
      const logs = await readTrainingLogs(result.jobId, store);
      setLogLines(logs.lines);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!lastResult) return;
    const r = await cancelTrainingJob(lastResult.jobId, store);
    setNotice(r.messageFr);
    const logs = await readTrainingLogs(lastResult.jobId, store);
    setLogLines(logs.lines);
  };

  const onCleanup = async () => {
    if (!lastResult) return;
    const r = await cleanupTrainingJob(lastResult.jobId, store);
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
          onChange={(e) => onPickFiles(e.target.files)}
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
