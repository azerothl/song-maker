import { useMemo } from "react";
import type { ScoreDocument, ScoreIssue } from "../lib/score";
import { groupScoreIssues } from "../lib/scoreIssueSummary";
import { midiPitchName } from "../lib/midiPitchName";
import { t } from "../ui/i18n";

export function ScoreIssueSummary({ issues, document }: {
  issues: readonly ScoreIssue[];
  document: ScoreDocument;
}) {
  const groups = useMemo(() => groupScoreIssues(issues), [issues]);
  const examples = useMemo(() => {
    const wanted = new Set(groups.flatMap((group) => group.noteIds));
    const found = new Map<string, string>();
    const meter = document.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
    const measureTicks = document.ppq * meter.numerator * 4 / meter.denominator;
    for (const voice of document.voices) {
      for (const note of voice.notes) {
        if (!wanted.has(note.id)) continue;
        found.set(note.id, t("score.issues.noteLocation", {
          voice: voice.name,
          pitch: midiPitchName(note.pitch),
          bar: Math.floor(note.startTick / measureTicks) + 1,
        }));
      }
    }
    return found;
  }, [groups, document]);
  if (groups.length === 0) return null;
  return (
    <details className="score-issue-summary">
      <summary>
        <strong>{t("score.issues.title")}</strong>
        <span>{t("score.issues.groupCount", { n: groups.length })}</span>
      </summary>
      <p className="hint">{t("score.issues.scope")}</p>
      <ul className="score-issue-groups">
        {groups.map((group) => (
          <li key={group.kind}>
            <strong>{t(`score.issues.${group.kind}.title`)}</strong>
            <span className="score-issue-count">{group.count}</span>
            <p>{t(`score.issues.${group.kind}.help`)}</p>
            {group.noteIds.some((id) => examples.has(id)) && (
              <p className="hint">{group.noteIds.map((id) => examples.get(id)).filter(Boolean).join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
