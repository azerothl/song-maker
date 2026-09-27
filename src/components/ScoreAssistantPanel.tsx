import { useMemo } from "react";
import type { ScoreDocument, ScoreIssue } from "../lib/score";
import {
  applyScoreFix,
  suggestFixesFromIssues,
  type ScoreFixSuggestion,
} from "../lib/scoreAssistant";
import { t } from "../ui/i18n";

type Props = {
  document: ScoreDocument | null;
  issues: readonly ScoreIssue[];
  onApplyDocument: (doc: ScoreDocument, messageFr: string) => void;
  onRequestCotFull?: () => void;
};

export function ScoreAssistantPanel({
  document,
  issues,
  onApplyDocument,
  onRequestCotFull,
}: Props) {
  const suggestions = useMemo(
    () => suggestFixesFromIssues(issues),
    [issues],
  );

  if (!document || suggestions.length === 0) return null;

  const onApply = (s: ScoreFixSuggestion) => {
    if (s.actionId === "set_cot_full") {
      onRequestCotFull?.();
      return;
    }
    const result = applyScoreFix(document, s.actionId);
    if (result) {
      onApplyDocument(result.document, result.messageFr);
    }
  };

  return (
    <section className="score-assistant" aria-labelledby="score-assistant-title">
      <h3 id="score-assistant-title">{t("phase4.assistant.title")}</h3>
      <p className="hint">{t("phase4.assistant.intro")}</p>
      <ul className="score-assistant-list">
        {suggestions.map((s) => (
          <li key={s.issueCode}>
            <div>
              <strong>{s.titleFr}</strong>
              <br />
              <span className="hint">{s.detailFr}</span>
            </div>
            {(s.autoApplicable || s.actionId === "set_cot_full") && (
              <button
                type="button"
                className="btn"
                onClick={() => onApply(s)}
              >
                {s.actionId === "set_cot_full"
                  ? t("phase4.assistant.setCot")
                  : t("phase4.assistant.apply")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
