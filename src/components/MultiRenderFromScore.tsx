import { t } from "../ui/i18n";
import type { GenerationSummary } from "../lib/types";

export type MultiRenderFromScoreProps = {
  generations: GenerationSummary[];
  busy: boolean;
  renderCount: number;
  onRenderCountChange: (n: number) => void;
  /**
   * Source gen with score.abc (typically `state === "score_only"` or any with hasScore).
   * Defaults to the latest score-bearing generation when omitted.
   */
  sourceGenerationId?: string | null;
  /**
   * Wire: loop `api.renderFromGeneration(projectId, sourceId, formForCall)`.
   * Parent of each new take is the source score gen.
   */
  onRenderFromScore: (sourceGenId: string, count: number) => void | Promise<void>;
};

function pickSource(
  generations: GenerationSummary[],
  preferred?: string | null,
): GenerationSummary | null {
  if (preferred) {
    const hit = generations.find((g) => g.id === preferred && g.hasScore);
    if (hit) return hit;
  }
  const scoreOnly = [...generations]
    .reverse()
    .find((g) => g.hasScore && (g.state === "score_only" || !g.audioPath));
  if (scoreOnly) return scoreOnly;
  return [...generations].reverse().find((g) => g.hasScore) ?? null;
}

/**
 * Multi-render from an immutable generation score.abc.
 * Does not edit SongScreen generate path — parent wires the API loop.
 */
export function MultiRenderFromScore({
  generations,
  busy,
  renderCount,
  onRenderCountChange,
  sourceGenerationId,
  onRenderFromScore,
}: MultiRenderFromScoreProps) {
  const source = pickSource(generations, sourceGenerationId);

  return (
    <div className="multi-render-from-score">
      <div className="btn-row">
        <label>
          {t("stopAfter.renderCount")}
          <select
            value={renderCount}
            disabled={busy || !source}
            onChange={(e) => onRenderCountChange(Number(e.target.value))}
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
          disabled={busy || !source || renderCount < 1}
          onClick={() => {
            if (!source) return;
            void onRenderFromScore(source.id, renderCount);
          }}
        >
          {t("stopAfter.renderFromScore")}
        </button>
      </div>
      <p className="hint">
        {source
          ? t("stopAfter.renderFromScoreHint", { id: source.id })
          : t("stopAfter.renderFromScoreEmpty")}
      </p>
    </div>
  );
}
