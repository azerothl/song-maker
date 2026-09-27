import { useMemo } from "react";
import type { GenerationSummary, ScoreSummary } from "../lib/types";
import { t } from "../ui/i18n";

type ArtifactKind = "generation" | "score" | "stem" | "mix";

type Props = {
  generations: GenerationSummary[];
  activeId: string | null | undefined;
  onUse: (genId: string) => void;
  /** Optional score branch summaries shown as distinct nodes. */
  scores?: ScoreSummary[];
  activeScoreId?: string | null;
  onUseScore?: (scoreId: string) => void;
  /** Optional counts for stem/mix distinction in the legend. */
  stemCount?: number;
  mixCount?: number;
};

type Node = GenerationSummary & { depth: number; children: string[] };

/**
 * Version graph: immutable gen-* folders + optional score / stem / mix kinds.
 * Score merge lives in ScoreBranchPanel (explicit conflicts) — not silent here.
 */
export function VersionGraph({
  generations,
  activeId,
  onUse,
  scores = [],
  activeScoreId,
  onUseScore,
  stemCount = 0,
  mixCount = 0,
}: Props) {
  const { roots, byId, ordered } = useMemo(() => {
    const byId = new Map<string, GenerationSummary>();
    for (const g of generations) byId.set(g.id, g);
    const children = new Map<string, string[]>();
    const roots: string[] = [];
    for (const g of generations) {
      const parent = g.parentGenerationId;
      if (parent && byId.has(parent)) {
        const list = children.get(parent) ?? [];
        list.push(g.id);
        children.set(parent, list);
      } else {
        roots.push(g.id);
      }
    }
    const ordered: Node[] = [];
    const visit = (id: string, depth: number) => {
      const g = byId.get(id);
      if (!g) return;
      ordered.push({
        ...g,
        depth,
        children: children.get(id) ?? [],
      });
      for (const child of children.get(id) ?? []) visit(child, depth + 1);
    };
    for (const r of roots) visit(r, 0);
    for (const g of generations) {
      if (!ordered.some((n) => n.id === g.id)) {
        ordered.push({ ...g, depth: 0, children: [] });
      }
    }
    return { roots, byId, ordered };
  }, [generations]);

  const kindLabel = (kind: ArtifactKind) => t(`versions.kind.${kind}`);

  if (generations.length === 0 && scores.length === 0) {
    return (
      <div className="version-graph">
        <h2>{t("versions.title")}</h2>
        <p className="hint">{t("versions.empty")}</p>
      </div>
    );
  }

  return (
    <div className="version-graph">
      <h2>{t("versions.title")}</h2>
      <p className="hint">{t("versions.hint")}</p>
      <p className="hint versions-legend">
        <span className="version-kind gen-kind">{kindLabel("generation")}</span>
        {" · "}
        <span className="version-kind score-kind">{kindLabel("score")}</span>
        {" · "}
        <span className="version-kind stem-kind">{kindLabel("stem")}</span>
        {" · "}
        <span className="version-kind mix-kind">{kindLabel("mix")}</span>
        {stemCount > 0 || mixCount > 0
          ? ` · ${stemCount} stems · ${mixCount} mixes`
          : ""}
      </p>

      {scores.length > 0 && (
        <ul className="version-tree score-nodes">
          {scores.map((s) => {
            const active = s.id === activeScoreId;
            return (
              <li key={s.id} className={active ? "active" : undefined}>
                <div className="version-row">
                  <span className="version-kind score-kind" aria-hidden>
                    {kindLabel("score")}
                  </span>
                  <span>
                    <strong>{s.branchName || s.id}</strong>
                    {" · "}
                    {s.id}
                    {s.parentScoreId
                      ? ` · ${t("versions.parent", { parent: s.parentScoreId })}`
                      : ""}
                  </span>
                  {onUseScore && (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={active}
                      onClick={() => onUseScore(s.id)}
                    >
                      {active
                        ? t("score.branchActive")
                        : t("score.branchUse")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="version-tree">
        {ordered.map((g) => {
          const active = g.id === activeId;
          const parentLabel = g.parentGenerationId
            ? g.parentGenerationId
            : t("versions.root");
          return (
            <li
              key={g.id}
              className={active ? "active" : undefined}
              style={{ paddingLeft: `${g.depth * 1.25}rem` }}
            >
              <div className="version-row">
                <span className="version-kind gen-kind" aria-hidden>
                  {kindLabel("generation")}
                </span>
                <span className="version-branch" aria-hidden>
                  {g.depth > 0 ? "↳" : "•"}
                </span>
                <span>
                  <strong>{g.id}</strong>
                  {" · "}
                  seed {g.seed}
                  {" · "}
                  {g.cot}
                  {" · "}
                  {g.state}
                  {g.hasScore ? ` · ${t("versions.hasScore")}` : ""}
                  <span className="hint">
                    {" · "}
                    {t("versions.parent", { parent: parentLabel })}
                  </span>
                  {active && (
                    <em className="gen-active"> · {t("generations.playing")}</em>
                  )}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={active}
                  onClick={() => {
                    if (window.confirm(t("generations.useHint"))) {
                      onUse(g.id);
                    }
                  }}
                >
                  {active ? t("generations.playing") : t("generations.use")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {roots.length > 1 && (
        <p className="hint">
          {t("versions.branches", { n: String(roots.length) })}
        </p>
      )}
      <p className="hint mono">
        {byId.size} dossiers immuables
        {scores.length > 0 ? ` · ${scores.length} partitions` : ""}
      </p>
    </div>
  );
}
