import { useEffect, useState, type Dispatch, SetStateAction } from "react";
import { AceStepAbPanel } from "../../components/AceStepAbPanel";
import { CandidateCompare } from "../../components/CandidateCompare";
import { VersionHistory } from "../../components/VersionHistory";
import { api } from "../../lib/api";
import {
  assignTakeOrdinals,
  resolveTakeTitle,
  type VersionEventSource,
} from "../../lib/versionHistory";
import { t } from "../../ui/i18n";
import type {
  GenerationSummary,
  ProjectDoc,
  SeparationVersionSummary,
} from "../../lib/types";
import { workspaceIntro, workspaceTitle } from "./shared";

/** Onglet Versions : historique lisible des prises et événements. */
type VersionsWorkspaceProps = {
  busy: boolean;
  candidateCount: number;
  continuationLyrics: string;
  generations: GenerationSummary[];
  onContinue: (generationId: string) => Promise<void>;
  onGenerateBatch: (count: number) => Promise<void>;
  onGenerateAceStep: () => Promise<void>;
  onRevertSeparation?: () => void;
  onRetryTake?: (generationId: string) => void;
  canRetryTake?: boolean;
  retryTakeBlockedReason?: string | null;
  onSeparationSwitched?: () => void;
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
  onGenerateAceStep,
  onRevertSeparation,
  onRetryTake,
  canRetryTake = true,
  retryTakeBlockedReason = null,
  onSeparationSwitched,
  openProject,
  project,
  setCandidateCount,
  setContinuationLyrics,
}: VersionsWorkspaceProps) {
  const [separations, setSeparations] = useState<SeparationVersionSummary[]>(
    [],
  );
  const [scores, setScores] = useState<VersionEventSource[]>([]);
  const [mixes, setMixes] = useState<VersionEventSource[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listSeparationVersions(project.id)
      .then((list) => {
        if (!cancelled) setSeparations(list);
      })
      .catch(() => {
        if (!cancelled) setSeparations([]);
      });
    void api
      .listScores(project.id)
      .then((list) => {
        if (cancelled) return;
        setScores(
          list
            .filter((s) => s.createdAt)
            .map((s) => ({
              id: s.id,
              createdAt: s.createdAt!,
              kind: "score" as const,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setScores([]);
      });
    void api
      .listMixVersions(project.id)
      .then((list) => {
        if (cancelled) return;
        setMixes(
          list.map((m) => ({
            id: m.id,
            createdAt: m.createdAt,
            kind: "mix" as const,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setMixes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    project.id,
    project.activeSeparationId,
    project.activeMixId,
    project.activeScoreId,
    generations.length,
  ]);

  const takeLabels = (() => {
    const ordinals = assignTakeOrdinals(generations);
    const labels: Record<string, string> = {};
    for (const g of generations) {
      const ordinal = ordinals.get(g.id) ?? 0;
      labels[g.id] = resolveTakeTitle(
        g.id,
        ordinal,
        project.generationNames,
      );
    }
    return labels;
  })();

  async function activateTake(genId: string) {
    await api.useGeneration(project.id, genId);
    await openProject(project.id);
  }

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

      <details className="version-candidates-fold">
        <summary className="version-candidates-fold-summary">
          <span>{t("candidates.title")}</span>
          <span className="hint">{t("candidates.foldSummary")}</span>
        </summary>
        <CandidateCompare
          generations={generations}
          activeId={project.activeGenerationId}
          busy={busy}
          candidateCount={candidateCount}
          onCandidateCount={setCandidateCount}
          onGenerateBatch={onGenerateBatch}
          takeLabels={takeLabels}
          showHeading={false}
          onUse={(genId) => {
            void activateTake(genId);
          }}
        />
        <AceStepAbPanel
          generations={generations}
          busy={busy}
          takeLabels={takeLabels}
          onGenerateAceStep={onGenerateAceStep}
        />
      </details>

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
              !generations.find((g) => g.id === project.activeGenerationId)
                ?.canContinue
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
        <VersionHistory
          generations={generations}
          separations={separations}
          scores={scores}
          mixes={mixes}
          project={project}
          busy={busy}
          onActivateTake={activateTake}
          onRetryTake={onRetryTake}
          canRetryTake={canRetryTake}
          retryTakeBlockedReason={retryTakeBlockedReason}
          onActivateSeparation={(separationId) => {
            void api
              .activateSeparationVersion(project.id, separationId)
              .then(() => {
                onSeparationSwitched?.();
                return openProject(project.id);
              });
          }}
          onRenameTake={async (genId, name) => {
            await api.renameGeneration(project.id, genId, name);
            await openProject(project.id);
          }}
          onSaveMixVersion={() => {
            void api.saveMixVersion(project.id).then(() => openProject(project.id));
          }}
          onRevertSeparation={onRevertSeparation}
        />
      </div>
    </section>
  );
}
