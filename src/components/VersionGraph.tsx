import { useMemo } from "react";
import type { GenerationSummary } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  generations: GenerationSummary[];
  activeId: string | null | undefined;
  onUse: (genId: string) => void;
};

type Node = GenerationSummary & { depth: number; children: string[] };

/**
 * Light version graph: immutable gen-* folders linked by parentGenerationId.
 * No merge UI — expose the existing folder lineage.
 */
export function VersionGraph({ generations, activeId, onUse }: Props) {
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
    // Orphans already in roots; ensure any missed ids appear
    for (const g of generations) {
      if (!ordered.some((n) => n.id === g.id)) {
        ordered.push({ ...g, depth: 0, children: [] });
      }
    }
    return { roots, byId, ordered };
  }, [generations]);

  if (generations.length === 0) {
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
        <p className="hint">{t("versions.branches", { n: String(roots.length) })}</p>
      )}
      <p className="hint mono">{byId.size} dossiers immuables</p>
    </div>
  );
}
