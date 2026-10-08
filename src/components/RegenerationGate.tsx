import { useEffect, useId, useState } from "react";
import type { ScoreDocument } from "../lib/score";
import {
  CONSERVATION_LEVELS,
  captureInvariantBaseline,
  checkConservation,
  clearInvariantBaseline,
  getInvariantBaselineMeta,
  loadInvariantBaseline,
  setInvariantBaselineLevel,
  conservationLevelLabel,
  type ConservationLevel,
  type InvariantCheckResult,
} from "../lib/invariants";
import { t } from "../ui/i18n";

export type RegenerationGatePhase =
  | "closed"
  | "pick_level"
  | "post_check"
  | "violations";

type Props = {
  open: boolean;
  projectId: string;
  /** Score before regenerate (baseline source). */
  beforeDocument: ScoreDocument | null;
  /**
   * Score after regenerate — when set while open, gate moves to post_check.
   * Pass null until generation finishes.
   */
  afterDocument?: ScoreDocument | null;
  /** True when this generate is a regeneration (prior gen / score exists). */
  isRegeneration: boolean;
  onProceed: (level: ConservationLevel) => void;
  onCancel: () => void;
  /** User confirmed keeping the new score despite / after check. */
  onConfirmKeep: () => void;
  /** User wants to revert to the baseline score document. */
  onRevert: (baselineScoreId: string | null) => void;
};

/**
 * Modal: pick ConservationLevel before regenerate, then check after and
 * confirm/revert. SongScreen should call this from onGenerate — see wiring notes.
 */
export function RegenerationGate({
  open,
  projectId,
  beforeDocument,
  afterDocument = null,
  isRegeneration,
  onProceed,
  onCancel,
  onConfirmKeep,
  onRevert,
}: Props) {
  const [level, setLevel] = useState<ConservationLevel>("pitches_and_rhythms");
  const [phase, setPhase] = useState<RegenerationGatePhase>("closed");
  const [result, setResult] = useState<InvariantCheckResult | null>(null);
  const proceedBlockedId = useId();
  const proceedBlocked =
    phase === "pick_level" && !beforeDocument && isRegeneration;
  const proceedBlockedReason = proceedBlocked
    ? t("phase4.regenGate.proceedBlocked")
    : null;

  useEffect(() => {
    if (!open) {
      setPhase("closed");
      setResult(null);
      return;
    }
    loadInvariantBaseline(projectId);
    const meta = getInvariantBaselineMeta();
    if (meta.level) setLevel(meta.level);
    if (afterDocument) {
      setPhase("post_check");
      return;
    }
    if (isRegeneration && beforeDocument) {
      setPhase("pick_level");
    } else {
      // First generation with score: capture baseline optionally, then proceed.
      setPhase("pick_level");
    }
  }, [open, projectId, beforeDocument, afterDocument, isRegeneration]);

  useEffect(() => {
    if (phase !== "post_check" || !afterDocument) return;
    const check = checkConservation(level, afterDocument);
    setResult(check);
    if (check && !check.ok) {
      setPhase("violations");
    }
  }, [phase, afterDocument, level]);

  if (!open || phase === "closed") return null;

  const onConfirmLevel = () => {
    if (beforeDocument) {
      captureInvariantBaseline(beforeDocument, { projectId, level });
      setInvariantBaselineLevel(level);
    }
    onProceed(level);
  };

  const onKeep = () => {
    if (afterDocument) {
      captureInvariantBaseline(afterDocument, { projectId, level });
    }
    onConfirmKeep();
  };

  const onRevertClick = () => {
    const meta = getInvariantBaselineMeta();
    onRevert(meta.scoreId);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal regeneration-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="regen-gate-title"
      >
        <h2 id="regen-gate-title">{t("phase4.regenGate.title")}</h2>

        {(phase === "pick_level") && (
          <>
            <p className="hint">{t("phase4.regenGate.intro")}</p>
            {!isRegeneration && (
              <p className="hint">{t("phase4.regenGate.firstGen")}</p>
            )}
            <label>
              {t("phase4.invariants.level")}
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as ConservationLevel)}
              >
                {CONSERVATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {conservationLevelLabel(l)}
                  </option>
                ))}
              </select>
            </label>
            {proceedBlockedReason && (
              <p
                id={proceedBlockedId}
                className="hint regen-gate-blocked-reason"
                role="status"
                data-testid="regen-gate-proceed-blocked-reason"
              >
                {proceedBlockedReason}
              </p>
            )}
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                data-testid="regen-gate-proceed"
                aria-disabled={proceedBlocked || undefined}
                aria-describedby={
                  proceedBlockedReason ? proceedBlockedId : undefined
                }
                onClick={() => {
                  if (proceedBlocked) return;
                  onConfirmLevel();
                }}
              >
                {t("phase4.regenGate.proceed")}
              </button>
              <button type="button" className="btn ghost" onClick={onCancel}>
                {t("phase4.regenGate.cancel")}
              </button>
            </div>
          </>
        )}

        {phase === "post_check" && result?.ok && (
          <>
            <p className="hint ok">{t("phase4.invariants.ok")}</p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={onKeep}>
                {t("phase4.regenGate.keep")}
              </button>
            </div>
          </>
        )}

        {phase === "post_check" && !result && (
          <p className="hint">{t("phase4.regenGate.checking")}</p>
        )}

        {phase === "violations" && result && (
          <>
            <div className="banner warn">
              <p>
                {t("phase4.invariants.fail", {
                  n: result.violations.length,
                })}
              </p>
              <details>
                <summary>{t("phase4.invariants.differences")}</summary>
                <ul className="score-issues">
                  {result.violations.map((v, i) => (
                    <li key={`${v.code}-${i}`} className="error">{v.message}</li>
                  ))}
                </ul>
              </details>
            </div>
            <p className="hint">{t("phase4.regenGate.decide")}</p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={onKeep}>
                {t("phase4.regenGate.keep")}
              </button>
              <button type="button" className="btn" onClick={onRevertClick}>
                {t("phase4.regenGate.revert")}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  clearInvariantBaseline(projectId);
                  onCancel();
                }}
              >
                {t("phase4.regenGate.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
