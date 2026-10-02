import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  REINTERPRETATION_DISCLAIMER_FR,
  assertAbcConfirmedForYue2,
  checkSheetsageReadiness,
  createSheetsageTranscriber,
  defaultSheetsageProbe,
  type LiveSheetsageRunner,
  type SheetsageAudioSource,
  type SheetsageProgress,
  type SheetsageRuntimeProbe,
  type SheetsageTranscribeResult,
} from "@song-maker/sheetsage";
import type { FormInput, InstallProgress, MixDoc } from "../lib/types";
import { api } from "../lib/api";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { t } from "../ui/i18n";
import { AbcStaffView } from "./AbcStaffView";

export type SheetSage2PanelProps = {
  projectId: string;
  form: FormInput;
  mix: MixDoc | null;
  busy: boolean;
  hideTitle?: boolean;
  onConfirmGenerate: (confirmedAbc: string, cot: "melody" | "full") => void | Promise<void>;
  playbackSeconds?: number;
  playbackReady?: boolean;
  onSeekPlayback?: (seconds: number) => void;
  /**
   * Open transcribed ABC as an editable ScoreDocument draft in the piano roll.
   * Source audio is never mutated. Optional — when omitted, MIDI draft button is hidden.
   */
  onOpenScoreDraft?: (abc: string, meta: { mode: "melody" | "full" }) => void | Promise<void>;
};

type SourceChoice = "mixdown" | string;

type SheetsageInstallInfo = {
  gguf: string;
  sha256: string;
  bytes: number;
  repo: string;
  remotePath: string;
  url: string;
  licenseNoticeFr: string;
  path: string;
  available: boolean;
};

/**
 * Audio → SheetSage2 ABC → edit → confirm → YuE2.
 * Opt-in weight install + Tauri LiveSheetsageRunner when binary+weights present.
 */
export function SheetSage2Panel({
  projectId,
  form,
  mix,
  busy,
  hideTitle = false,
  onConfirmGenerate,
  playbackSeconds = 0,
  playbackReady = false,
  onSeekPlayback,
  onOpenScoreDraft,
}: SheetSage2PanelProps) {
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("mixdown");
  const [mode, setMode] = useState<"melody" | "full">("melody");
  const [progress, setProgress] = useState<SheetsageProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposedAbc, setProposedAbc] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(
    null,
  );
  const [installInfo, setInstallInfo] = useState<SheetsageInstallInfo | null>(
    null,
  );
  const [hostProbe, setHostProbe] = useState<Partial<SheetsageRuntimeProbe> | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureForceSheetsageReady = () => {
      setProposedAbc("X:1\nT:Capture\nM:4/4\nL:1/8\nK:C\nCDEF GABc|");
      setConfirmed(true);
      setLicenseAccepted(true);
    };
    return () => {
      delete window.__captureForceSheetsageReady;
    };
  }, []);

  const refreshProbe = async () => {
    if (!isTauriRuntime()) return;
    const p = await runtimeApi.sheetsageProbe();
    setHostProbe({
      binaryPresent: p.binaryPresent,
      binaryPath: p.binaryPath,
      weightsPresent: p.weightsPresent,
      weightsPath: p.weightsPath,
      weightsSha256Verified: p.weightsSha256Verified,
      diskBytesAvailable: p.diskBytesAvailable,
      acceleration:
        p.acceleration === "cuda" || p.acceleration === "cpu"
          ? p.acceleration
          : "unknown",
    });
    setNotice(p.messageFr);
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [info] = await Promise.all([
          runtimeApi.sheetsageInstallInfo(),
          refreshProbe(),
        ]);
        if (!cancelled) setInstallInfo(info);
      } catch (e) {
        if (!cancelled) {
          setNotice(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("sheetsage2-progress", (event) => {
      setInstallProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const probe = useMemo(
    () =>
      defaultSheetsageProbe({
        ...hostProbe,
        licenseAccepted,
      }),
    [hostProbe, licenseAccepted],
  );
  const readiness = useMemo(
    () => checkSheetsageReadiness(probe),
    [probe],
  );

  const liveRunner: LiveSheetsageRunner | undefined = useMemo(() => {
    if (!isTauriRuntime()) return undefined;
    return async (request): Promise<SheetsageTranscribeResult> => {
      const jobId = `sheetsage-${Date.now()}`;
      jobIdRef.current = jobId;
      let audioPath = request.source.path?.trim() || "";
      if (!audioPath && request.source.kind === "mixdown") {
        request.onProgress?.({
          jobId,
          phase: "queued",
          fraction: 0.05,
          messageFr: "Export du mixdown WAV avant transcription…",
        });
        try {
          audioPath = await api.exportAudio(projectId, "wav");
        } catch (e) {
          return {
            status: "failed",
            jobId,
            abc: null,
            warnings: ["mixdown_export_failed"],
            messageFr: `Export mixdown impossible : ${
              e instanceof Error ? e.message : String(e)
            }. Aucune ABC inventée.`,
            reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
          };
        }
      }
      if (!audioPath) {
        return {
          status: "failed",
          jobId,
          abc: null,
          warnings: ["missing_audio_path"],
          messageFr:
            "Chemin audio manquant (exportez un mixdown ou choisissez une piste avec fichier). Aucune ABC inventée.",
          reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
        };
      }
      request.onProgress?.({
        jobId,
        phase: "transcribing",
        fraction: 0.2,
        messageFr: "Transcription SheetSage2 en cours…",
      });
      const outcome = await runtimeApi.sheetsageTranscribe({
        jobId,
        audioPath,
        mode: request.mode ?? "melody",
        licenseAccepted: request.licenseAccepted,
      });
      if (request.signal?.aborted || outcome.status === "cancelled") {
        return {
          status: "cancelled",
          jobId,
          abc: null,
          warnings: [],
          messageFr: "Transcription annulée.",
          reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
        };
      }
      return {
        status: outcome.status as SheetsageTranscribeResult["status"],
        jobId: outcome.jobId,
        abc: outcome.abc,
        warnings: outcome.warnings,
        messageFr: outcome.messageFr,
        reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
      };
    };
  }, [projectId]);

  const sources: SheetsageAudioSource[] = useMemo(() => {
    const list: SheetsageAudioSource[] = [
      {
        kind: "mixdown",
        id: "mixdown",
        label: t("sheetsage.source.mixdown"),
        path: null,
      },
    ];
    if (mix) {
      for (const tr of mix.tracks) {
        const clip = tr.clips[0];
        list.push({
          kind: "user_track",
          id: tr.id,
          label: `${tr.name}${tr.aiSeparated ? "" : " · user"}`,
          path: clip?.sourcePath ?? null,
          durationMs: clip?.durationMs ?? null,
        });
      }
    }
    return list;
  }, [mix]);

  const selectedSource: SheetsageAudioSource =
    sources.find((s) =>
      sourceChoice === "mixdown"
        ? s.kind === "mixdown"
        : s.id === sourceChoice,
    ) ?? sources[0]!;

  const onInstallWeights = async () => {
    if (!isTauriRuntime()) {
      setNotice(t("sheetsage.install.needDesktop"));
      return;
    }
    if (!licenseAccepted) {
      setNotice(t("sheetsage.install.needLicense"));
      return;
    }
    setInstalling(true);
    setNotice(null);
    setInstallProgress(null);
    try {
      const path = await runtimeApi.installSheetsage2();
      setNotice(t("sheetsage.install.done").replace("{path}", path));
      const info = await runtimeApi.sheetsageInstallInfo();
      setInstallInfo(info);
      await refreshProbe();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const onCancelInstall = async () => {
    if (!isTauriRuntime()) return;
    try {
      const msg = await runtimeApi.cancelSheetsage2Install();
      setNotice(msg);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const onTranscribe = async () => {
    setTranscribing(true);
    setNotice(null);
    setProposedAbc("");
    setConfirmed(false);
    setProgress(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const transcriber = createSheetsageTranscriber(probe, liveRunner);
      const result = await transcriber.transcribe({
        source: selectedSource,
        licenseAccepted,
        mode,
        signal: ac.signal,
        onProgress: setProgress,
      });
      setNotice(result.messageFr);
      if (result.status === "ok" && result.abc) {
        setProposedAbc(result.abc);
      }
    } finally {
      setTranscribing(false);
    }
  };

  const onCancel = async () => {
    abortRef.current?.abort();
    if (jobIdRef.current && isTauriRuntime()) {
      try {
        const msg = await runtimeApi.sheetsageCancel(jobIdRef.current);
        setNotice(msg);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const onConfirmScore = () => {
    const gate = assertAbcConfirmedForYue2(proposedAbc);
    if (!gate.ok) {
      setNotice(gate.messageFr);
      setConfirmed(false);
      return;
    }
    setConfirmed(true);
    setNotice(gate.messageFr);
  };

  const onGenerate = () => {
    const gate = assertAbcConfirmedForYue2(proposedAbc);
    if (!gate.ok || !confirmed) {
      setNotice(
        confirmed
          ? gate.messageFr
          : t("sheetsage.needConfirm"),
      );
      return;
    }
    void onConfirmGenerate(proposedAbc.trim(), mode);
  };

  const onOpenDraft = () => {
    if (!onOpenScoreDraft || !proposedAbc.trim()) return;
    void onOpenScoreDraft(proposedAbc.trim(), { mode });
  };

  const showInstall =
    isTauriRuntime() &&
    licenseAccepted &&
    readiness.status === "missing_weights";
  const canTranscribe =
    licenseAccepted && readiness.canAttemptTranscribe && !installing;
  const bytesLabel = installInfo
    ? `${(installInfo.bytes / 1e9).toFixed(1)} Go`
    : "~2,7 Go";

  return (
    <section
      className="sheetsage-panel"
      aria-labelledby={hideTitle ? undefined : "sheetsage-title"}
      aria-label={hideTitle ? t("sheetsage.title") : undefined}
    >
      {!hideTitle && <h3 id="sheetsage-title">{t("sheetsage.title")}</h3>}
      <p className="hint">{t("sheetsage.intro")}</p>
      <ol className="sheetsage-steps hint">
        <li>{t("sheetsage.step.source")}</li>
        <li>{t("sheetsage.step.mode")}</li>
        <li>{t("sheetsage.step.transcribe")}</li>
        <li>{t("sheetsage.step.edit")}</li>
        <li>{t("sheetsage.step.scoreDraft")}</li>
        <li>{t("sheetsage.step.confirm")}</li>
        <li>{t("sheetsage.step.generate")}</li>
      </ol>
      <p className="hint warn" role="note">
        {REINTERPRETATION_DISCLAIMER_FR}{" "}
        {t("sheetsage.licenseLimits")}{" "}
        <span className="nc-model-badge" data-testid="sheetsage-nc-badge">
          <span className="sep-license-icon" aria-hidden="true">
            ⊘
          </span>
          {t("sheetsage.license.badge")}
        </span>
      </p>
      {readiness.status !== "license_not_accepted" && (
        <p className="hint">{readiness.messageFr}</p>
      )}

      <label className="phase3-check">
        <input
          type="checkbox"
          checked={licenseAccepted}
          onChange={(e) => {
            setLicenseAccepted(e.target.checked);
            setConfirmed(false);
          }}
        />
        {t("sheetsage.license")}
      </label>

      {showInstall && (
        <div className="phase3-bs-install">
          <p className="hint">{t("sheetsage.install.hint")}</p>
          {installInfo && (
            <p className="hint">
              {installInfo.licenseNoticeFr}
              <br />
              {t("sheetsage.install.meta")
                .replace("{size}", bytesLabel)
                .replace("{sha}", installInfo.sha256.slice(0, 12))}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={busy || installing || !licenseAccepted}
              onClick={() => void onInstallWeights()}
            >
              {installing
                ? t("sheetsage.install.installing")
                : t("sheetsage.install")}
            </button>
            {installing && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void onCancelInstall()}
              >
                {t("sheetsage.install.cancel")}
              </button>
            )}
          </div>
          {installProgress && (
            <p className="hint">
              {installProgress.label}
              {installProgress.totalBytes
                ? ` (${Math.min(
                    100,
                    Math.round(
                      (installProgress.receivedBytes /
                        installProgress.totalBytes) *
                        100,
                    ),
                  )} %)`
                : ""}
            </p>
          )}
        </div>
      )}

      <label className="invariant-level">
        {t("sheetsage.source")}
        <select
          value={sourceChoice}
          onChange={(e) => {
            setSourceChoice(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="mixdown">{t("sheetsage.source.mixdown")}</option>
          {mix?.tracks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.name}
              {tr.aiSeparated ? "" : ` (${t("sheetsage.source.userTrack")})`}
            </option>
          ))}
        </select>
      </label>

      <label className="invariant-level">
        {t("sheetsage.mode")}
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as "melody" | "full");
            setConfirmed(false);
          }}
        >
          <option value="melody">{t("sheetsage.mode.melody")}</option>
          <option value="full">{t("sheetsage.mode.full")}</option>
        </select>
      </label>

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={busy || transcribing || !canTranscribe}
          onClick={() => void onTranscribe()}
        >
          {transcribing ? t("sheetsage.transcribing") : t("sheetsage.transcribe")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={!transcribing}
          onClick={() => void onCancel()}
        >
          {t("sheetsage.cancel")}
        </button>
      </div>
      {progress && (
        <p className="hint">
          {progress.messageFr}
          {progress.fraction != null
            ? ` (${Math.round(progress.fraction * 100)} %)`
            : ""}
        </p>
      )}

      <label className="invariant-level">
        {t("sheetsage.abc")}
        <textarea
          rows={8}
          className="sheetsage-abc"
          value={proposedAbc}
          placeholder={t("sheetsage.abcPlaceholder")}
          onChange={(e) => {
            setProposedAbc(e.target.value);
            setConfirmed(false);
          }}
          spellCheck={false}
        />
      </label>
      <p className="hint">{t("sheetsage.pasteHint")}</p>

      {/^X:/m.test(proposedAbc.trim()) && (
        <details className="sheetsage-staff" open>
          <summary>{t("sheetsage.staffPreview")}</summary>
          <AbcStaffView
            abc={proposedAbc}
            compact
            playbackSeconds={playbackSeconds}
            playbackReady={playbackReady}
            onSeek={onSeekPlayback}
          />
        </details>
      )}

      <div className="btn-row">
        {onOpenScoreDraft && (
          <button
            type="button"
            className="btn"
            disabled={busy || !proposedAbc.trim()}
            onClick={onOpenDraft}
          >
            {t("sheetsage.openScoreDraft")}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy || !proposedAbc.trim()}
          onClick={onConfirmScore}
        >
          {t("sheetsage.confirmScore")}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !confirmed || !proposedAbc.trim()}
          onClick={onGenerate}
        >
          {t("sheetsage.generateYue2")}
        </button>
      </div>
      <p className="hint">{t("sheetsage.scoreDraftHint")}</p>
      {confirmed && (
        <p className="hint ok">{t("sheetsage.confirmed", { style: form.style || "—" })}</p>
      )}
      {notice && <pre className="phase3-download-notice">{notice}</pre>}
    </section>
  );
}

declare global {
  interface Window {
    __captureForceSheetsageReady?: () => void;
  }
}
