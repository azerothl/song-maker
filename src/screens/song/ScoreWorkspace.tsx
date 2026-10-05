import type { Dispatch, SetStateAction } from "react";
import { AbcTakePreview } from "../../components/AbcTakePreview";
import { MultiRenderFromScore } from "../../components/MultiRenderFromScore";
import { ScoreOnlyGenerate } from "../../components/ScoreOnlyGenerate";
import { ScorePanel } from "../../components/ScorePanel";
import { SheetSage2Panel } from "../../components/SheetSage2Panel";
import { api } from "../../lib/api";
import { generationErrorMessage } from "../../lib/generationError";
import { t } from "../../ui/i18n";
import type { FormInput, GenerationSummary, MixDoc, ProjectDoc } from "../../lib/types";
import type { ScoreDocument } from "../../lib/score";
import type { PlaybackView } from "../../components/AudioPlayer";
import {
  SCORE_MODES,
  scoreModeLabel,
  workspaceIntro,
  workspaceTitle,
  type ScoreMode
} from "./shared";

/** Onglet Score : partition, reprise ABC et rendus depuis le score. */
type ScoreWorkspaceProps = {
  busy: boolean;
  canGenerateScoreOnly: boolean;
  form: FormInput;
  generations: GenerationSummary[];
  mix: MixDoc | null;
  onGenerateScoreOnly: () => Promise<void>;
  onRenderFromScore: (sourceGenId: string, count: number) => Promise<void>;
  onSheetsageOpenScoreDraft: (abc: string, meta: { mode: "melody" | "full" }) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  playback: PlaybackView | null;
  project: ProjectDoc;
  renderFromScoreCount: number;
  scoreAbc: string | null;
  scoreDocument: ScoreDocument | null;
  scoreMode: ScoreMode;
  scoreOpen: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: (e: string | null) => void;
  setForm: (patch: Partial<FormInput>) => void;
  setRenderFromScoreCount: Dispatch<SetStateAction<number>>;
  setScoreDocument: (doc: ScoreDocument | null) => void;
  setScoreMode: Dispatch<SetStateAction<ScoreMode>>;
  setScoreOpen: (v: boolean) => void;
};

export function ScoreWorkspace({
  busy,
  canGenerateScoreOnly,
  form,
  generations,
  mix,
  onGenerateScoreOnly,
  onRenderFromScore,
  onSheetsageOpenScoreDraft,
  openProject,
  playback,
  project,
  renderFromScoreCount,
  scoreAbc,
  scoreDocument,
  scoreMode,
  scoreOpen,
  setBusy,
  setError,
  setForm,
  setRenderFromScoreCount,
  setScoreDocument,
  setScoreMode,
  setScoreOpen,
}: ScoreWorkspaceProps) {
  return (
    <section
      className="song-workspace-panel wide"
      role="tabpanel"
      id="song-panel-score"
      aria-labelledby="song-tab-score"
    >
      <header className="song-workspace-heading">
        <h2>{workspaceTitle("score")}</h2>
        <p className="hint">{workspaceIntro("score")}</p>
      </header>

      <nav
        className="song-subnav"
        role="tablist"
        aria-label={t("workspace.score.mode.nav")}
      >
        {SCORE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            className="song-subnav-tab"
            aria-selected={scoreMode === mode}
            id={`score-mode-${mode}`}
            aria-controls={`score-mode-panel-${mode}`}
            tabIndex={scoreMode === mode ? 0 : -1}
            onClick={() => setScoreMode(mode)}
          >
            {scoreModeLabel(mode)}
          </button>
        ))}
      </nav>

      <div
        id="score-mode-panel-edit"
        role="tabpanel"
        aria-labelledby="score-mode-edit"
        hidden={scoreMode !== "edit"}
      >
        <div className="score-edit-section">
          <ScorePanel
            projectId={project.id}
            document={scoreDocument}
            cot={form.cot}
            title={form.title}
            onDocumentChange={setScoreDocument}
            onProjectRefresh={() => openProject(project.id)}
            onError={setError}
            onCotChange={(cot) => setForm({ cot })}
            defaultOpen
            playbackSeconds={playback?.current ?? 0}
            playbackReady={Boolean(playback?.ready)}
            onSeekPlayback={playback?.seek}
          />
        </div>

        {!scoreDocument && (
          <div className="score-reprise-nudge">
            <p className="hint">{t("workspace.score.repriseHint")}</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setScoreMode("reprise")}
            >
              {t("workspace.score.openReprise")}
            </button>
          </div>
        )}

        {scoreDocument && (
          <div
            className="song-actions"
            aria-label={t("workspace.score.primary")}
          >
            <ScoreOnlyGenerate
              canGenerate={canGenerateScoreOnly}
              busy={busy}
              onGenerateScoreOnly={onGenerateScoreOnly}
            />
            <MultiRenderFromScore
              generations={generations}
              busy={busy}
              renderCount={renderFromScoreCount}
              onRenderCountChange={setRenderFromScoreCount}
              onRenderFromScore={onRenderFromScore}
            />
          </div>
        )}

        <AbcTakePreview
          abc={scoreAbc}
          open={scoreOpen}
          onOpenChange={setScoreOpen}
          request={{
            tempoBpm: form.tempoBpm,
            key: form.key,
            meter: form.meter,
          }}
        />
      </div>

      <div
        id="score-mode-panel-reprise"
        role="tabpanel"
        aria-labelledby="score-mode-reprise"
        hidden={scoreMode !== "reprise"}
        className="sheetsage-section"
      >
        {scoreMode === "reprise" && (
          <SheetSage2Panel
            projectId={project.id}
            form={form}
            mix={mix}
            busy={busy}
            hideTitle
            playbackSeconds={playback?.current ?? 0}
            playbackReady={Boolean(playback?.ready)}
            onSeekPlayback={playback?.seek}
            onOpenScoreDraft={onSheetsageOpenScoreDraft}
            onConfirmGenerate={async (confirmedAbc, cot) => {
              setBusy(true);
              setError(null);
              try {
                const formForCall: FormInput = { ...form, cot };
                await api.startGeneration(
                  project.id,
                  formForCall,
                  confirmedAbc,
                  {
                    sourceGenerationId: project.activeGenerationId ?? null,
                  },
                );
                await openProject(project.id);
              } catch (e) {
                setError(generationErrorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </section>
  );
}
