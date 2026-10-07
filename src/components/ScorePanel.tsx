import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CotProfile, ScoreDocument, ScoreIssue } from "../lib/score";
import {
  createEmptyScoreDocument,
  exportScoreAbc,
  exportScoreMidi,
  importMidiBytes,
  validateScoreForGeneration,
  vocalToInsAbc,
} from "../lib/score";
import { buildStaffAbc } from "../lib/staffAbc";
import { clearInvariantBaseline } from "../lib/invariants";
import { api } from "../lib/api";
import { AbcStaffView } from "./AbcStaffView";
import { AbcRawPreview } from "./AbcTakePreview";
import { InvariantPanel } from "./InvariantPanel";
import { MidiInstrumentPanel } from "./MidiInstrumentPanel";
import { PianoRoll } from "./PianoRoll";
import { ScoreAssistantPanel } from "./ScoreAssistantPanel";
import { ScoreBranchPanel } from "./ScoreBranchPanel";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

type ScoreViewMode = "staff" | "piano" | "abc";

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
  /** Live playback position (seconds) for staff sync. */
  playbackSeconds?: number;
  playbackReady?: boolean;
  onSeekPlayback?: (seconds: number) => void;
};

function scoreViewLabel(mode: ScoreViewMode): string {
  switch (mode) {
    case "staff":
      return t("score.view.staff");
    case "piano":
      return t("score.view.piano");
    case "abc":
      return t("score.view.abc");
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Squelette réservé (CLS 0) + annonce lecteurs d’écran pendant le gel d’ouverture (#249). */
function ScoreStaffSkeleton() {
  return (
    <div
      className="abc-staff-view score-staff-skeleton"
      aria-busy="true"
      aria-label={t("score.staff.loadingRegion")}
      data-score-staff-skeleton=""
    >
      <p className="sr-only" role="status" aria-live="polite">
        {t("score.staff.loading")}
      </p>
      <div
        className="abc-staff-toolbar score-staff-skeleton-toolbar"
        aria-hidden="true"
      >
        <span className="score-staff-skeleton-chip" />
        <span className="score-staff-skeleton-chip" />
        <span className="score-staff-skeleton-chip wide" />
      </div>
      <div
        className="abc-staff-scroll score-staff-skeleton-scroll"
        aria-hidden="true"
      >
        <div className="score-staff-skeleton-bars">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export function ScorePanel({
  projectId,
  document,
  cot,
  title,
  onDocumentChange,
  onProjectRefresh,
  onError,
  onCotChange,
  playbackSeconds = 0,
  playbackReady = false,
  onSeekPlayback,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const vocalToInsHelpId = useId();
  const [issues, setIssues] = useState<ScoreIssue[]>([]);
  const [abcPreview, setAbcPreview] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ScoreViewMode>("staff");
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    bytes: Uint8Array;
    suggestedQuantizeTicks: number;
  } | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureForceScorePendingImport = () => {
      setPendingImport({
        bytes: new Uint8Array([77, 84, 104, 100]),
        suggestedQuantizeTicks: 120,
      });
    };
    return () => {
      delete window.__captureForceScorePendingImport;
    };
  }, []);

  const [status, setStatus] = useState<string | null>(null);
  const [branchRefresh, setBranchRefresh] = useState(0);
  /** Après 2 rAF : laisse peindre le squelette avant buildStaffAbc / abcjs (#249). */
  const [staffHeavyReady, setStaffHeavyReady] = useState(false);
  const forceStaffSkeleton =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("staffSkeleton");
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const latencyMs = settings?.audioLatencyMs ?? 20;
  const needsStaffAbc = viewMode === "staff" || viewMode === "abc";
  const documentKey = document
    ? `${document.id}:${document.version}`
    : null;

  async function persistLatency(ms: number) {
    if (!settings) return;
    const next = {
      ...settings,
      audioLatencyMs: Math.max(0, Math.min(200, Math.round(ms))),
    };
    try {
      await api.updateSettings(next);
      await refreshSettings();
    } catch (e) {
      onError(String(e));
    }
  }

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

  useEffect(() => {
    if (forceStaffSkeleton || !document || !needsStaffAbc) {
      setStaffHeavyReady(false);
      return;
    }
    setStaffHeavyReady(false);
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setStaffHeavyReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2 !== 0) cancelAnimationFrame(raf2);
    };
  }, [document, documentKey, needsStaffAbc, forceStaffSkeleton]);

  const staffAbc = useMemo(() => {
    if (!document || !staffHeavyReady || forceStaffSkeleton) return null;
    return buildStaffAbc(document, title || undefined);
  }, [document, title, staffHeavyReady, forceStaffSkeleton]);

  const staffBarDurationSeconds = useMemo(() => {
    if (!document) return undefined;
    const quarterBpm = document.tempoMap[0]?.quarterBpm;
    const ts = document.timeSignatures[0];
    if (!quarterBpm || !ts?.numerator || !ts.denominator) return undefined;
    return ((ts.numerator * 4) / ts.denominator) * (60 / quarterBpm);
  }, [document]);

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
                aria-describedby={!abcPreview ? vocalToInsHelpId : undefined}
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
            {!abcPreview && (
              <p
                id={vocalToInsHelpId}
                className="score-panel-action-help"
              >
                {t("score.vocalToInsRequiresPreview")}
              </p>
            )}
          </header>

          <nav
            className="score-view-tabs"
            role="tablist"
            aria-label={t("score.view.tabs")}
          >
            {(["staff", "piano", "abc"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                id={`score-view-${mode}`}
                className="score-view-tab"
                aria-selected={viewMode === mode}
                aria-controls={`score-view-panel-${mode}`}
                tabIndex={viewMode === mode ? 0 : -1}
                onClick={() => setViewMode(mode)}
              >
                {scoreViewLabel(mode)}
              </button>
            ))}
          </nav>

          <div
            id="score-view-panel-staff"
            role="tabpanel"
            aria-labelledby="score-view-staff"
            hidden={viewMode !== "staff"}
          >
            {/* Mount staff only when visible: abcjs SVG work is the open-tab cost. */}
            {viewMode === "staff" &&
              (!staffHeavyReady || !staffAbc ? (
                <ScoreStaffSkeleton />
              ) : staffAbc.ok ? (
                <AbcStaffView
                  abc={staffAbc.abc}
                  warnings={staffAbc.warnings}
                  playbackSeconds={playbackSeconds}
                  playbackReady={playbackReady}
                  onSeek={onSeekPlayback}
                  fallbackBarDurationSeconds={staffBarDurationSeconds}
                  abcPrepared
                />
              ) : (
                <div className="score-staff-fallback">
                  <p className="hint" role="alert">
                    {staffAbc.error ?? t("score.staff.unavailable")}
                  </p>
                  <p className="hint">{t("score.staff.switchPiano")}</p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setViewMode("piano")}
                  >
                    {t("score.view.piano")}
                  </button>
                </div>
              ))}
          </div>

          <div
            id="score-view-panel-piano"
            role="tabpanel"
            aria-labelledby="score-view-piano"
            hidden={viewMode !== "piano"}
          >
            {/* Lazy: SoftSynth + wide piano grid must not run on staff open (#113). */}
            {viewMode === "piano" && (
              <>
                <PianoRoll
                  document={document}
                  onChange={(doc) => {
                    onDocumentChange(doc);
                    setAbcPreview(null);
                  }}
                  onError={onError}
                />
                <MidiInstrumentPanel
                  projectId={projectId}
                  onProjectRefresh={onProjectRefresh}
                  document={document}
                  onDocumentChange={(doc) => {
                    onDocumentChange(doc);
                    setAbcPreview(null);
                  }}
                  latencyMs={latencyMs}
                  onLatencyChange={(ms) => void persistLatency(ms)}
                  onError={onError}
                />
              </>
            )}
          </div>

          <div
            id="score-view-panel-abc"
            role="tabpanel"
            aria-labelledby="score-view-abc"
            hidden={viewMode !== "abc"}
          >
            {viewMode === "abc" &&
              (!staffHeavyReady || !staffAbc ? (
                <p className="hint" role="status" aria-live="polite">
                  {t("score.staff.loading")}
                </p>
              ) : staffAbc.ok ? (
                <AbcRawPreview abc={staffAbc.abc} />
              ) : abcPreview ? (
                <AbcRawPreview abc={abcPreview} />
              ) : (
                <p className="hint">{t("score.view.abcEmpty")}</p>
              ))}
            {viewMode === "abc" &&
              staffAbc &&
              !staffAbc.ok &&
              staffAbc.issues.length > 0 && (
                <ul className="score-issues">
                  {staffAbc.issues.map((issue, i) => (
                    <li key={`staff-i-${i}`} className={issue.severity}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
          </div>

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

          {abcPreview && viewMode !== "abc" && (
            <details>
              <summary>{t("score.abcPreview")}</summary>
              <AbcRawPreview abc={abcPreview} className="score" />
            </details>
          )}

          {status && <p className="hint ok">{status}</p>}

          <p className="hint">{t("score.phase2Note")}</p>
        </>
      )}
    </section>
  );
}

declare global {
  interface Window {
    __captureForceScorePendingImport?: () => void;
  }
}
