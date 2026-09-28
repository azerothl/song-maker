import { useMemo, useRef, useState } from "react";
import type { CotProfile, ScoreDocument, ScoreIssue } from "../lib/score";
import {
  createEmptyScoreDocument,
  exportScoreAbc,
  exportScoreMidi,
  importMidiBytes,
  validateScoreForGeneration,
  vocalToInsAbc,
} from "../lib/score";
import { clearInvariantBaseline } from "../lib/invariants";
import { api } from "../lib/api";
import { InvariantPanel } from "./InvariantPanel";
import { PianoRoll } from "./PianoRoll";
import { ScoreAssistantPanel } from "./ScoreAssistantPanel";
import { ScoreBranchPanel } from "./ScoreBranchPanel";
import { t } from "../ui/i18n";

type Props = {
  projectId: string;
  document: ScoreDocument | null;
  cot: string;
  title: string;
  onDocumentChange: (doc: ScoreDocument | null) => void;
  onProjectRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onCotChange?: (cot: string) => void;
  /** When true, parent may keep the Partition <details> open (informational). */
  defaultOpen?: boolean;
};

export function ScorePanel({
  projectId,
  document,
  cot,
  title,
  onDocumentChange,
  onProjectRefresh,
  onError,
  onCotChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<ScoreIssue[]>([]);
  const [abcPreview, setAbcPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    bytes: Uint8Array;
    suggestedQuantizeTicks: number;
  } | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [branchRefresh, setBranchRefresh] = useState(0);

  const validation = useMemo(() => {
    if (!document) return null;
    if (cot !== "full" && cot !== "melody") {
      return {
        ok: false as const,
        issues: [
          {
            code: "abc_with_cot_off" as const,
            severity: "error" as const,
            message: t("score.cotOffBlocked"),
          },
        ],
      };
    }
    return validateScoreForGeneration(document, cot);
  }, [document, cot]);

  async function persist(doc: ScoreDocument) {
    setBusy(true);
    onError(null);
    try {
      const { project } = await api.saveScore(projectId, doc);
      onDocumentChange({ ...doc, id: project.activeScoreId ?? doc.id });
      await onProjectRefresh();
      setBranchRefresh((n) => n + 1);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    onError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const result = importMidiBytes(buf);
      if (result.suggestedQuantizeTicks) {
        setPendingImport({
          bytes: buf,
          suggestedQuantizeTicks: result.suggestedQuantizeTicks,
        });
        setIssues(result.issues);
        return;
      }
      await persist(result.document);
      setIssues(result.issues);
      setAbcPreview(null);
    } catch (e) {
      onError(String(e));
    }
  }

  async function confirmQuantize(apply: boolean) {
    if (!pendingImport) return;
    try {
      const result = importMidiBytes(pendingImport.bytes, {
        applyQuantize: apply,
        quantizeTicks: pendingImport.suggestedQuantizeTicks,
      });
      await persist(result.document);
      setIssues(result.issues);
      setPendingImport(null);
      setAbcPreview(null);
    } catch (e) {
      onError(String(e));
    }
  }

  async function createBlank() {
    clearInvariantBaseline(projectId);
    const blank = createEmptyScoreDocument({ branchName: "main" });
    await persist(blank);
    setAbcPreview(null);
    setIssues([]);
    setStatus(t("score.blankCreated"));
  }

  function previewAbc() {
    if (!document) return;
    if (cot !== "full" && cot !== "melody") {
      onError(t("score.cotOffBlocked"));
      return;
    }
    const check = validateScoreForGeneration(document, cot as CotProfile);
    setIssues(check.issues);
    if (!check.ok) {
      onError(check.issues[0]?.message ?? t("score.validationFailed"));
      setAbcPreview(null);
      return;
    }
    try {
      const { abc, warnings } = exportScoreAbc(
        document,
        cot,
        title || undefined,
      );
      setAbcPreview(abc);
      if (warnings.length)
        setIssues(
          warnings.map((message) => ({
            code: "validation_failed" as const,
            severity: "warning" as const,
            message,
          })),
        );
    } catch (e) {
      onError(String(e));
      setAbcPreview(null);
    }
  }

  function applyVocalToIns() {
    const source = abcPreview;
    if (!source) {
      onError(t("score.needPreview"));
      return;
    }
    try {
      const { abc, movedNoteCount } = vocalToInsAbc(source);
      setAbcPreview(abc);
      setStatus(
        movedNoteCount > 0
          ? t("score.vocalToInsOk", { n: movedNoteCount })
          : t("score.vocalToInsEmpty"),
      );
    } catch (e) {
      onError(String(e));
    }
  }

  function downloadMidi() {
    if (!document) return;
    try {
      const bytes = exportScoreMidi(document);
      const blob = new Blob([bytes], { type: "audio/midi" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document.branchName || document.id || "score"}.mid`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(t("score.exportMidiOk"));
    } catch (e) {
      onError(String(e));
    }
  }

  async function clearScore() {
    setBusy(true);
    try {
      clearInvariantBaseline(projectId);
      await api.clearScore(projectId);
      onDocumentChange(null);
      setAbcPreview(null);
      setIssues([]);
      await onProjectRefresh();
      setBranchRefresh((n) => n + 1);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="score-panel">
      <input
        ref={fileRef}
        type="file"
        accept=".mid,.midi,audio/midi"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />

      {pendingImport && (
        <div className="banner warn">
          <span>{t("score.quantizeAsk")}</span>
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => void confirmQuantize(true)}
            >
              {t("score.quantizeYes")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void confirmQuantize(false)}
            >
              {t("score.quantizeNo")}
            </button>
          </div>
        </div>
      )}

      {!document && (
        <div className="score-empty">
          <p className="score-empty-lead">{t("score.emptyLead")}</p>
          <p className="hint">{t("score.emptyCta")}</p>
          <div className="btn-row" role="group" aria-label={t("score.emptyLead")}>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {t("score.importMidi")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void createBlank()}
            >
              {t("score.createBlank")}
            </button>
          </div>
          <p className="hint">{t("score.none")}</p>
        </div>
      )}

      {document && (
        <>
          <header className="score-panel-header">
            <h2>{t("score.editor")}</h2>
            <div
              className="btn-row"
              role="group"
              aria-label={t("score.editActions")}
            >
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => document && void persist(document)}
              >
                {t("score.save")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={downloadMidi}
              >
                {t("score.exportMidi")}
              </button>
              <button type="button" className="btn" onClick={previewAbc}>
                {t("score.previewAbc")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!abcPreview}
                onClick={applyVocalToIns}
                title={t("score.vocalToInsHint")}
              >
                {t("score.vocalToIns")}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void clearScore()}
              >
                {t("score.clear")}
              </button>
            </div>
          </header>

          <PianoRoll
            document={document}
            onChange={(doc) => {
              onDocumentChange(doc);
              setAbcPreview(null);
            }}
            onError={onError}
          />

          {validation && !validation.ok && (
            <ul className="score-issues">
              {validation.issues.map((issue, i) => (
                <li key={`${issue.code}-${i}`} className={issue.severity}>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          {issues.length > 0 && (
            <ul className="score-issues">
              {issues.map((issue, i) => (
                <li key={`i-${i}`} className={issue.severity}>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <ScoreAssistantPanel
            document={document}
            issues={[
              ...(validation && !validation.ok ? validation.issues : []),
              ...issues,
            ]}
            onApplyDocument={(doc, messageFr) => {
              onDocumentChange(doc);
              setAbcPreview(null);
              setStatus(messageFr);
              setIssues([]);
            }}
            onRequestCotFull={() => onCotChange?.("full")}
          />

          <InvariantPanel document={document} projectId={projectId} />

          <ScoreBranchPanel
            projectId={projectId}
            document={document}
            refreshToken={branchRefresh}
            onDocumentChange={(doc) => {
              onDocumentChange(doc);
              setAbcPreview(null);
            }}
            onProjectRefresh={onProjectRefresh}
            onError={onError}
          />

          {abcPreview && (
            <details open>
              <summary>{t("score.abcPreview")}</summary>
              <pre className="score">{abcPreview}</pre>
            </details>
          )}

          {status && <p className="hint ok">{status}</p>}

          <p className="hint">{t("score.phase2Note")}</p>
        </>
      )}
    </section>
  );
}
