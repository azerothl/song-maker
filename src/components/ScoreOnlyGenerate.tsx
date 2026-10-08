import { STOP_AFTER_ABC_ENABLED } from "@song-maker/score-engine";
import { t } from "../ui/i18n";

export type ScoreOnlyGenerateProps = {
  /** True when form + cot allow score-only (cot ≠ off, no external ABC). */
  canGenerate: boolean;
  disabledReason: string;
  busy: boolean;
  onGenerateScoreOnly: () => void | Promise<void>;
};

/**
 * Score-only generation control (`stop_after=abc`).
 * Wire from SongScreen: call `api.startGeneration(id, form, null, { stopAfter: "abc" })`.
 */
export function ScoreOnlyGenerate({
  canGenerate,
  disabledReason,
  busy,
  onGenerateScoreOnly,
}: ScoreOnlyGenerateProps) {
  if (!STOP_AFTER_ABC_ENABLED) {
    return <p className="hint">{t("stopAfter.gated")}</p>;
  }

  return (
    <div className="score-only-generate">
      <button
        type="button"
        className="btn"
        disabled={!canGenerate || busy}
        onClick={() => void onGenerateScoreOnly()}
      >
        {t("stopAfter.generateScoreOnly")}
      </button>
      <p className="hint">
        {busy || !canGenerate
          ? disabledReason
          : t("stopAfter.generateScoreOnlyHint")}
      </p>
    </div>
  );
}
