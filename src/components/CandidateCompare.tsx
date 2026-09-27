import {
  createCandidateComparer,
  type CandidateCompareView,
  type GenerationCandidate,
} from "@song-maker/score-engine";
import { useMemo, useState } from "react";
import type { GenerationSummary } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  generations: GenerationSummary[];
  activeId: string | null | undefined;
  busy: boolean;
  candidateCount: number;
  onCandidateCount: (n: number) => void;
  onGenerateBatch: (count: number) => Promise<void>;
  onUse: (genId: string) => void;
};

function toCandidate(g: GenerationSummary): GenerationCandidate | null {
  if (!g.audioPath) return null;
  return {
    id: g.id,
    generationFolder: g.id,
    seed: g.seed,
    createdAt: g.createdAt,
    audioPath: g.audioPath,
    scoreAbcPath: g.hasScore ? "score.abc" : null,
    label: `${g.id} · seed ${g.seed}`,
  };
}

export function CandidateCompare({
  generations,
  activeId,
  busy,
  candidateCount,
  onCandidateCount,
  onGenerateBatch,
  onUse,
}: Props) {
  const comparer = useMemo(() => createCandidateComparer(), []);
  const [view, setView] = useState<CandidateCompareView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = generations.filter((g) => g.state === "generated" && g.audioPath);

  function openFromReady() {
    setError(null);
    const candidates = ready
      .slice(-Math.max(2, Math.min(4, ready.length)))
      .map(toCandidate)
      .filter((c): c is GenerationCandidate => c !== null);
    try {
      setView(comparer.openCompare(candidates));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="candidate-compare">
      <div className="candidate-compare-header">
        <h2>{t("candidates.title")}</h2>
        <p className="hint">{t("candidates.hint")}</p>
      </div>

      <div className="candidate-controls">
        <label>
          {t("candidates.count")}
          <select
            value={candidateCount}
            disabled={busy}
            onChange={(e) => onCandidateCount(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={busy || candidateCount < 2}
          onClick={() => void onGenerateBatch(candidateCount)}
        >
          {t("candidates.generate")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={ready.length < 2}
          onClick={openFromReady}
        >
          {t("candidates.compare")}
        </button>
      </div>

      {error && <p className="hint error">{error}</p>}

      {view && (
        <ul className="candidate-list">
          {view.candidates.map((c) => {
            const selected = view.selectedId === c.id;
            const active = activeId === c.id;
            return (
              <li key={c.id} className={selected ? "selected" : undefined}>
                <span>
                  {c.label ?? c.id}
                  {active && (
                    <em className="gen-active"> · {t("generations.playing")}</em>
                  )}
                </span>
                <div className="btn-row">
                  <button
                    type="button"
                    className={selected ? "btn active" : "btn"}
                    onClick={() => setView(comparer.select(view, c.id))}
                  >
                    {t("candidates.select")}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={active}
                    onClick={() => {
                      if (window.confirm(t("generations.useHint"))) {
                        onUse(c.id);
                      }
                    }}
                  >
                    {t("generations.use")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view && view.selectedId && (
        <p className="hint ok">
          {t("candidates.selected", { id: view.selectedId })}
        </p>
      )}
      {view && !view.selectedId && (
        <p className="hint">{t("candidates.noAutoWinner")}</p>
      )}
    </div>
  );
}
