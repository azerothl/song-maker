import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  createEmptyScoreDocument,
  diffScores,
  forkScoreBranch,
  mergeScores,
  type MergeConflictResolution,
  type ScoreDocument,
  type ScoreDocumentDiff,
} from "../lib/score";
import { clearInvariantBaseline } from "../lib/invariants";
import type { ScoreSummary } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  projectId: string;
  document: ScoreDocument | null;
  /** Bump to reload score list after save/clear. */
  refreshToken?: number;
  onDocumentChange: (doc: ScoreDocument | null) => void;
  onProjectRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
};

function asScoreDocument(value: unknown): ScoreDocument | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ScoreDocument;
  if (!v.id || !Array.isArray(v.voices)) return null;
  return v;
}

/**
 * Score branch / compare / explicit merge UI (§12.2).
 * Self-contained — SongScreen only needs to pass document + refresh callbacks.
 */
export function ScoreBranchPanel({
  projectId,
  document,
  refreshToken = 0,
  onDocumentChange,
  onProjectRefresh,
  onError,
}: Props) {
  const [scores, setScores] = useState<ScoreSummary[]>([]);
  const [branchName, setBranchName] = useState("");
  const [compareLeftId, setCompareLeftId] = useState("");
  const [compareRightId, setCompareRightId] = useState("");
  const [diff, setDiff] = useState<ScoreDocumentDiff | null>(null);
  const [leftDoc, setLeftDoc] = useState<ScoreDocument | null>(null);
  const [rightDoc, setRightDoc] = useState<ScoreDocument | null>(null);
  const [noteChoices, setNoteChoices] = useState<
    Record<string, "left" | "right">
  >({});
  const [metaSide, setMetaSide] = useState<"left" | "right">("left");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureForceScoreBranchMerge = () => {
      const left = createEmptyScoreDocument({ id: "capture-branch-a" });
      const right = createEmptyScoreDocument({ id: "capture-branch-b" });
      const voice = right.voices[0];
      if (voice) {
        voice.notes = [
          {
            id: "n1",
            pitch: 64,
            startTick: 0,
            durationTick: 480,
            velocity: 90,
          },
        ];
      }
      setLeftDoc(left);
      setRightDoc(right);
      setDiff(diffScores(left, right));
      setNoteChoices({});
      setMetaSide("left");
    };
    return () => {
      delete window.__captureForceScoreBranchMerge;
    };
  }, []);

  async function reload() {
    try {
      const list = await api.listScores(projectId);
      setScores(Array.isArray(list) ? list : []);
    } catch (e) {
      onError(String(e));
      setScores([]);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on project / token
  }, [projectId, refreshToken]);

  const conflicts = useMemo(
    () => (diff?.noteDiffs ?? []).filter((d) => d.kind === "changed"),
    [diff],
  );

  async function createBranch() {
    if (!document) {
      onError(t("score.branchNeedDoc"));
      return;
    }
    const name = branchName.trim() || `branch-${scores.length + 1}`;
    setBusy(true);
    onError(null);
    try {
      const forked = forkScoreBranch(document, name);
      clearInvariantBaseline(projectId);
      const { project } = await api.saveScore(projectId, forked);
      onDocumentChange({ ...forked, id: project.activeScoreId ?? forked.id });
      setBranchName("");
      setStatus(t("score.branchCreated", { name }));
      await onProjectRefresh();
      await reload();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchTo(scoreId: string) {
    setBusy(true);
    onError(null);
    try {
      clearInvariantBaseline(projectId);
      await api.setActiveScore(projectId, scoreId);
      const raw = await api.loadScoreVersion(projectId, scoreId);
      const doc = asScoreDocument(raw);
      onDocumentChange(doc);
      setStatus(t("score.branchSwitched", { id: scoreId }));
      await onProjectRefresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCompare() {
    if (!compareLeftId || !compareRightId) {
      onError(t("score.compareNeedTwo"));
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const [lRaw, rRaw] = await Promise.all([
        api.loadScoreVersion(projectId, compareLeftId),
        api.loadScoreVersion(projectId, compareRightId),
      ]);
      const left = asScoreDocument(lRaw);
      const right = asScoreDocument(rRaw);
      if (!left || !right) {
        onError(t("score.compareLoadFail"));
        return;
      }
      setLeftDoc(left);
      setRightDoc(right);
      const d = diffScores(left, right);
      setDiff(d);
      const initial: Record<string, "left" | "right"> = {};
      for (const c of d.noteDiffs.filter((x) => x.kind === "changed")) {
        initial[`${c.voiceId}:${c.noteId}`] = "left";
      }
      setNoteChoices(initial);
      setMetaSide("left");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runMerge() {
    if (!leftDoc || !rightDoc || !diff) {
      onError(t("score.mergeNeedCompare"));
      return;
    }
    for (const c of conflicts) {
      const key = `${c.voiceId}:${c.noteId}`;
      if (!noteChoices[key]) {
        onError(t("score.mergeUnresolved"));
        return;
      }
    }
    if (
      !window.confirm(
        t("score.mergeConfirm", {
          n: String(conflicts.length),
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const resolution: MergeConflictResolution = {
        noteChoices,
        metaSide,
      };
      const merged = mergeScores(leftDoc, rightDoc, resolution, {
        branchName: `merge-${leftDoc.branchName ?? leftDoc.id}-${rightDoc.branchName ?? rightDoc.id}`,
        parentScoreId: leftDoc.id,
      });
      clearInvariantBaseline(projectId);
      const { project } = await api.saveScore(projectId, merged);
      onDocumentChange({ ...merged, id: project.activeScoreId ?? merged.id });
      setDiff(null);
      setLeftDoc(null);
      setRightDoc(null);
      setStatus(t("score.mergeOk"));
      await onProjectRefresh();
      await reload();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="score-branch-panel" aria-labelledby="score-branch-title">
      <h3 id="score-branch-title">{t("score.branchTitle")}</h3>
      <p className="hint">{t("score.branchHint")}</p>

      <div className="btn-row">
        <label>
          {t("score.branchName")}
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder={t("score.branchNamePlaceholder")}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!document || busy}
          onClick={() => void createBranch()}
        >
          {t("score.branchCreate")}
        </button>
      </div>

      {scores.length === 0 ? (
        <p className="hint">{t("score.branchEmpty")}</p>
      ) : (
        <ul className="version-tree score-branch-tree">
          {scores.map((s) => {
            const active = document?.id === s.id;
            return (
              <li key={s.id} className={active ? "active" : undefined}>
                <div className="version-row">
                  <span className="version-kind score-kind" aria-hidden>
                    {t("versions.kind.score")}
                  </span>
                  <span>
                    <strong>{s.branchName || s.id}</strong>
                    {" · "}
                    {s.id}
                    {" · "}
                    v{s.version}
                    {" · "}
                    {s.noteCount} notes
                    {s.parentScoreId ? (
                      <span className="hint">
                        {" · "}
                        {t("versions.parent", { parent: s.parentScoreId })}
                      </span>
                    ) : null}
                    {active && (
                      <em className="gen-active"> · {t("score.branchActive")}</em>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={active || busy}
                    onClick={() => void switchTo(s.id)}
                  >
                    {t("score.branchUse")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="score-compare">
        <h4>{t("score.compareTitle")}</h4>
        <div className="btn-row">
          <label>
            A
            <select
              value={compareLeftId}
              onChange={(e) => setCompareLeftId(e.target.value)}
            >
              <option value="">{t("score.comparePick")}</option>
              {scores.map((s) => (
                <option key={`l-${s.id}`} value={s.id}>
                  {s.branchName || s.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            B
            <select
              value={compareRightId}
              onChange={(e) => setCompareRightId(e.target.value)}
            >
              <option value="">{t("score.comparePick")}</option>
              {scores.map((s) => (
                <option key={`r-${s.id}`} value={s.id}>
                  {s.branchName || s.id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void runCompare()}
          >
            {t("score.compare")}
          </button>
        </div>
      </div>

      {diff && (
        <div className="score-diff">
          <p className="hint">
            {t("score.diffSummary", {
              notes: String(diff.noteDiffs.length),
              sections: String(diff.sectionDiffs.length),
              chords: String(diff.chordDiffs.length),
              meta: diff.metaChanges.join(", ") || "—",
            })}
          </p>
          {conflicts.length > 0 && (
            <ul className="score-issues">
              {conflicts.map((c) => {
                const key = `${c.voiceId}:${c.noteId}`;
                return (
                  <li key={key} className="warning">
                    <span>
                      {t("score.conflictNote", {
                        id: c.noteId,
                        left: String(c.left?.pitch ?? "?"),
                        right: String(c.right?.pitch ?? "?"),
                      })}
                    </span>
                    <select
                      value={noteChoices[key] ?? "left"}
                      onChange={(e) =>
                        setNoteChoices((prev) => ({
                          ...prev,
                          [key]: e.target.value as "left" | "right",
                        }))
                      }
                    >
                      <option value="left">A</option>
                      <option value="right">B</option>
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
          {diff.metaChanges.length > 0 && (
            <label>
              {t("score.mergeMeta")}
              <select
                value={metaSide}
                onChange={(e) =>
                  setMetaSide(e.target.value as "left" | "right")
                }
              >
                <option value="left">A</option>
                <option value="right">B</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void runMerge()}
          >
            {t("score.merge")}
          </button>
          <p className="hint">{t("score.mergeNoSilent")}</p>
        </div>
      )}

      {!document && scores.length === 0 && (
        <p className="hint">
          {t("score.branchBootstrap", {
            action: t("score.createBlank"),
          })}
        </p>
      )}

      {status && <p className="hint ok">{status}</p>}
    </section>
  );
}

declare global {
  interface Window {
    __captureForceScoreBranchMerge?: () => void;
  }
}
