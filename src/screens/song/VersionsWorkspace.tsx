import type { Dispatch, SetStateAction } from "react";
import { CandidateCompare } from "../../components/CandidateCompare";
import { VersionGraph } from "../../components/VersionGraph";
import { api } from "../../lib/api";
import { t } from "../../ui/i18n";
import type { GenerationSummary, ProjectDoc } from "../../lib/types";
import {
  workspaceIntro,
  workspaceTitle,
} from "./shared";

/** Onglet Versions : historique des générations et continuation. */
type VersionsWorkspaceProps = {
  busy: boolean;
  candidateCount: number;
  continuationLyrics: string;
  generations: GenerationSummary[];
  onContinue: (generationId: string) => Promise<void>;
  onGenerateBatch: (count: number) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  project: ProjectDoc;
  setCandidateCount: Dispatch<SetStateAction<number>>;
  setContinuationLyrics: Dispatch<SetStateAction<string>>;
};

export function VersionsWorkspace({
  busy,
  candidateCount,
  continuationLyrics,
  generations,
  onContinue,
  onGenerateBatch,
  openProject,
  project,
  setCandidateCount,
  setContinuationLyrics,
}: VersionsWorkspaceProps) {
  return (
    <section
      className="song-workspace-panel wide"
      role="tabpanel"
      id="song-panel-versions"
      aria-labelledby="song-tab-versions"
    >
      <header className="song-workspace-heading">
        <h2>{workspaceTitle("versions")}</h2>
        <p className="hint">{workspaceIntro("versions")}</p>
      </header>

      <CandidateCompare
        generations={generations}
        activeId={project.activeGenerationId}
        busy={busy}
        candidateCount={candidateCount}
        onCandidateCount={setCandidateCount}
        onGenerateBatch={onGenerateBatch}
        onUse={(genId) => {
          void api
            .useGeneration(project.id, genId)
            .then(() => openProject(project.id));
        }}
      />

      {generations.find((g) => g.id === project.activeGenerationId)
        ?.semanticTruncated && (
        <section
          className="continuation-panel"
          aria-labelledby="continue-title"
        >
          <h3 id="continue-title">{t("generations.lyricsTruncated")}</h3>
          <p className="hint">{t("generations.continueHint")}</p>
          <label>
            {t("generations.remainingLyrics")}
            <textarea
              rows={5}
              value={continuationLyrics}
              onChange={(e) => setContinuationLyrics(e.target.value)}
              placeholder={t("generations.remainingLyricsPlaceholder")}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={
              busy ||
              !continuationLyrics.trim() ||
              !generations.find(
                (g) => g.id === project.activeGenerationId,
              )?.canContinue
            }
            onClick={() => {
              const active = generations.find(
                (g) => g.id === project.activeGenerationId,
              );
              if (active) void onContinue(active.id);
            }}
          >
            {t("generations.continue")}
          </button>
        </section>
      )}

      <div className="version-history">
        <h3>
          {t("versions.history", {
            count: String(generations.length),
          })}
        </h3>
        <p className="hint">{t("versions.hint")}</p>
        <VersionGraph
          generations={generations}
          activeId={project.activeGenerationId}
          onUse={(genId) => {
            void api
              .useGeneration(project.id, genId)
              .then(() => openProject(project.id));
          }}
        />
      </div>
    </section>
  );
}
