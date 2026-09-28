import { useMemo, useState } from "react";
import {
  REINTERPRETATION_DISCLAIMER_FR,
  assertAbcConfirmedForYue2,
  checkSheetsageReadiness,
  createSheetsageTranscriber,
  defaultSheetsageProbe,
  type SheetsageAudioSource,
  type SheetsageProgress,
} from "@song-maker/sheetsage";
import type { FormInput, MixDoc } from "../lib/types";
import { t } from "../ui/i18n";

export type SheetSage2PanelProps = {
  projectId: string;
  form: FormInput;
  mix: MixDoc | null;
  busy: boolean;
  /** When true, omit the panel H3 (parent already provides the workspace title). */
  hideTitle?: boolean;
  /**
   * Real YuE2 path — parent must only call when user confirmed ABC.
   * Typically: api.startGeneration(projectId, { ...form, cot }, confirmedAbc)
   */
  onConfirmGenerate: (confirmedAbc: string, cot: "melody" | "full") => void | Promise<void>;
};

type SourceChoice = "mixdown" | string;

/**
 * Audio → SheetSage2 ABC (stub until runtime) → edit → confirm → YuE2.
 * Never calls onConfirmGenerate before explicit confirmation.
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

  const probe = useMemo(
    () => defaultSheetsageProbe({ licenseAccepted }),
    [licenseAccepted],
  );
  const readiness = useMemo(
    () => checkSheetsageReadiness(probe),
    [probe],
  );

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
    try {
      const transcriber = createSheetsageTranscriber(probe);
      const result = await transcriber.transcribe({
        source: selectedSource,
        licenseAccepted,
        mode,
        onProgress: setProgress,
      });
      setNotice(result.messageFr);
      if (result.status === "ok" && result.abc) {
        setProposedAbc(result.abc);
      }
      // Honest stub: no fake ABC when not_implemented / missing_runtime.
    } finally {
      setTranscribing(false);
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
        {REINTERPRETATION_DISCLAIMER_FR}
      </p>
      <p className="hint">{readiness.messageFr}</p>

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
