import { useEffect, useState } from "react";
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

type Props = {
  document: ScoreDocument | null;
  /** When set, baseline is persisted under localStorage keyed by projectId. */
  projectId?: string;
};

export function InvariantPanel({ document, projectId }: Props) {
  const [level, setLevel] = useState<ConservationLevel>("pitches_and_rhythms");
  const [result, setResult] = useState<InvariantCheckResult | null>(null);
  const [baselineMeta, setBaselineMeta] = useState(getInvariantBaselineMeta());

  useEffect(() => {
    if (projectId) {
      const loaded = loadInvariantBaseline(projectId);
      if (loaded.level) setLevel(loaded.level);
      setBaselineMeta(getInvariantBaselineMeta());
    }
  }, [projectId]);

  useEffect(() => {
    setResult(null);
  }, [document?.version, document?.id]);

  if (!document) return null;

  const onCapture = () => {
    captureInvariantBaseline(document, { projectId, level });
    setBaselineMeta(getInvariantBaselineMeta());
    setResult(null);
  };

  const onClear = () => {
    clearInvariantBaseline(projectId);
    setBaselineMeta(getInvariantBaselineMeta());
    setResult(null);
  };

  const onCheck = () => {
    setResult(checkConservation(level, document));
  };

  return (
    <section className="invariant-panel" aria-labelledby="invariant-title">
      <h3 id="invariant-title">{t("phase4.invariants.title")}</h3>
      <p className="hint">{t("phase4.invariants.intro")}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onCapture}>
          {t("phase4.invariants.capture")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={!baselineMeta.captured}
          onClick={onClear}
        >
          {t("phase4.invariants.clear")}
        </button>
      </div>
      <label className="invariant-level">
        {t("phase4.invariants.level")}
        <select
          value={level}
          onChange={(e) => {
            const next = e.target.value as ConservationLevel;
            setLevel(next);
            setInvariantBaselineLevel(next);
          }}
        >
          {CONSERVATION_LEVELS.map((l) => (
            <option key={l} value={l}>
              {conservationLevelLabel(l)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn primary"
        disabled={!baselineMeta.captured}
        onClick={onCheck}
      >
        {t("phase4.invariants.check")}
      </button>
      {!baselineMeta.captured && (
        <p className="hint">{t("phase4.invariants.needBaseline")}</p>
      )}
      {baselineMeta.captured && projectId && (
        <p className="hint">{t("phase4.invariants.persisted")}</p>
      )}
      {result && (
        <div className={result.ok ? "banner ok" : "banner warn"}>
          <p>
            {result.ok
              ? t("phase4.invariants.ok")
              : t("phase4.invariants.fail", { n: result.violations.length })}
          </p>
          {!result.ok && (
            <details>
              <summary>{t("phase4.invariants.differences")}</summary>
              <ul className="score-issues">
                {result.violations.map((v, i) => (
                  <li key={`${v.code}-${i}`} className="error">{v.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
