import { useEffect, useMemo, useRef, useState } from "react";
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
import type { FormInput, MixDoc } from "../lib/types";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { t } from "../ui/i18n";

export type SheetSage2PanelProps = {
  projectId: string;
  form: FormInput;
  mix: MixDoc | null;
  busy: boolean;
  hideTitle?: boolean;
  onConfirmGenerate: (confirmedAbc: string, cot: "melody" | "full") => void | Promise<void>;
};

type SourceChoice = "mixdown" | string;

/**
 * Audio → SheetSage2 ABC → edit → confirm → YuE2.
 * Uses Tauri LiveSheetsageRunner when binary+weights are present.
 */
export function SheetSage2Panel({
  form,
  mix,
  busy,
  hideTitle = false,
  onConfirmGenerate,
}: SheetSage2PanelProps) {
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("mixdown");
  const [mode, setMode] = useState<"melody" | "full">("melody");
  const [progress, setProgress] = useState<SheetsageProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposedAbc, setProposedAbc] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [hostProbe, setHostProbe] = useState<Partial<SheetsageRuntimeProbe> | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void runtimeApi
      .sheetsageProbe()
      .then((p) => {
        if (cancelled) return;
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
      })
      .catch((e) => {
        if (!cancelled) {
          setNotice(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
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
      const audioPath = request.source.path?.trim();
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
  }, []);

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
        <li>{t("sheetsage.step.confirm")}</li>
        <li>{t("sheetsage.step.generate")}</li>
      </ol>
      <p className="hint warn" role="note">
        {REINTERPRETATION_DISCLAIMER_FR}{" "}
        {t("sheetsage.licenseLimits")}
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
          disabled={busy || transcribing || !licenseAccepted}
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

      <div className="btn-row">
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
      {confirmed && (
        <p className="hint ok">{t("sheetsage.confirmed", { style: form.style || "—" })}</p>
      )}
      {notice && <pre className="phase3-download-notice">{notice}</pre>}
    </section>
  );
}
