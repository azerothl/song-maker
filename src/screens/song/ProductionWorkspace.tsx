import type { Dispatch, SetStateAction } from "react";
import { ClipTimeline } from "../../components/ClipTimeline";
import { ExportWizard } from "../../components/ExportWizard";
import { MixAssistPanel } from "../../components/MixAssistPanel";
import { Phase3MixPanel } from "../../components/Phase3MixPanel";
import { ProductionAssistPanel } from "../../components/ProductionAssistPanel";
import { RecordTrackPanel } from "../../components/RecordTrackPanel";
import { Waveform } from "../../components/Waveform";
import { api } from "../../lib/api";
import { t } from "../../ui/i18n";
import type { FormInput, MixDoc, PlaybackSources, ProjectDoc, SeparationInfo } from "../../lib/types";
import type { ScoreGate } from "../../lib/score";
import type { PlaybackView } from "../../components/AudioPlayer";
import {
  formatGainDb,
  formatPan,
  PRODUCTION_VIEWS,
  productionViewIntro,
  productionViewLabel,
  warningLabel,
  workspaceIntro,
  workspaceTitle,
  type ProductionView
} from "./shared";

/** Onglet Production : mixage, clips, séparation et outils. */
type ProductionWorkspaceProps = {
  busy: boolean;
  form: FormInput;
  importingAudio: boolean;
  listeningMix: MixDoc | null;
  mix: MixDoc | null;
  onExport: (format: "wav" | "flac" | "mp3") => Promise<void>;
  onImportUserAudio: () => Promise<void>;
  onSeparate: () => Promise<void>;
  onUserTrackAdded: (next: MixDoc) => Promise<void>;
  playback: PlaybackView | null;
  playbackSources: PlaybackSources | null;
  productionView: ProductionView;
  project: ProjectDoc;
  recordOpen: boolean;
  roleByTrack: Record<string, string>;
  scheduleMixUpdate: (next: MixDoc | null) => void;
  scoreGate: ScoreGate;
  separationInfo: SeparationInfo | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: (e: string | null) => void;
  setMix: (mix: MixDoc | null) => void;
  setMixPreview: Dispatch<SetStateAction<MixDoc | null>>;
  setProductionView: Dispatch<SetStateAction<ProductionView>>;
  setRecordOpen: Dispatch<SetStateAction<boolean>>;
  showMixAssist: boolean;
  showProductionCopilot: boolean;
  sourceDurationMsByTrack: Record<string, number>;
};

export function ProductionWorkspace({
  busy,
  form,
  importingAudio,
  listeningMix,
  mix,
  onExport,
  onImportUserAudio,
  onSeparate,
  onUserTrackAdded,
  playback,
  playbackSources,
  productionView,
  project,
  recordOpen,
  roleByTrack,
  scheduleMixUpdate,
  scoreGate,
  separationInfo,
  setBusy,
  setError,
  setMix,
  setMixPreview,
  setProductionView,
  setRecordOpen,
  showMixAssist,
  showProductionCopilot,
  sourceDurationMsByTrack,
}: ProductionWorkspaceProps) {
  return (
    <section
      className="song-workspace-panel wide"
      role="tabpanel"
      id="song-panel-production"
      aria-labelledby="song-tab-production"
    >
      <header className="song-workspace-heading">
        <h2>{workspaceTitle("production")}</h2>
        <p className="hint">{workspaceIntro("production")}</p>
      </header>

      <nav
        className="song-subnav"
        role="tablist"
        aria-label={t("workspace.production.nav")}
      >
        {PRODUCTION_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            className="song-subnav-tab"
            aria-selected={productionView === view}
            id={`production-view-${view}`}
            aria-controls={`production-panel-${view}`}
            tabIndex={productionView === view ? 0 : -1}
            onClick={() => setProductionView(view)}
          >
            {productionViewLabel(view)}
          </button>
        ))}
      </nav>

      <p className="hint song-subview-intro">
        {productionViewIntro(productionView)}
      </p>

      <div className="production-global-actions">
        <div className="song-actions">
          <div className="btn-row song-actions-primary">
            <button
              type="button"
              className="btn primary"
              disabled={!project.activeGenerationId || busy}
              onClick={() => void onSeparate()}
            >
              {t("separate.button")}
            </button>
          </div>
          <div
            className="btn-row song-actions-export"
            role="group"
            aria-label={t("export.group")}
          >
            <span className="song-actions-label">{t("export.group")}</span>
            <button
              type="button"
              className="btn"
              disabled={!project.activeGenerationId || busy}
              onClick={() => void onExport("wav")}
            >
              {t("export.wav")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!project.activeGenerationId || busy}
              onClick={() => void onExport("flac")}
            >
              {t("export.flac")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!project.activeGenerationId || busy}
              onClick={() => void onExport("mp3")}
            >
              {t("export.mp3")}
            </button>
          </div>
        </div>

        <div className="mix-user-actions">
          <button
            type="button"
            className="btn"
            disabled={busy || importingAudio}
            onClick={() => void onImportUserAudio()}
          >
            {importingAudio ? t("mix.importing") : t("mix.importAudio")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setRecordOpen((v) => !v)}
            aria-expanded={recordOpen}
          >
            {t("mix.recordAudio")}
          </button>
          <p className="hint">{t("mix.importHint")}</p>
        </div>

        <RecordTrackPanel
          projectId={project.id}
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          onTrackAdded={(m) => void onUserTrackAdded(m)}
          onError={setError}
        />
      </div>

      <div
        id="production-panel-mix"
        role="tabpanel"
        aria-labelledby="production-view-mix"
        hidden={productionView !== "mix"}
      >
        {mix ? (
          <div className="mixer">
            {separationInfo && separationInfo.warnings.length > 0 && (
              <aside
                className="banner warn separation-warn"
                role="status"
                aria-live="polite"
              >
                <div>
                  <strong>{t("separation.warn.title")}</strong>
                  <ul className="separation-warn-list">
                    {separationInfo.warnings.map((code) => (
                      <li key={code}>{warningLabel(code)}</li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
            {showProductionCopilot && (
              <ProductionAssistPanel
                mix={mix}
                sources={playbackSources}
                scoreIssues={scoreGate.issues}
                listeningMix={listeningMix ?? mix}
                onCommitMix={scheduleMixUpdate}
                onPreviewMix={setMixPreview}
                onSaveMixVersion={() =>
                  api
                    .saveMixVersion(project.id)
                    .then((m) => setMix(m))
                }
              />
            )}
            {showMixAssist && (
              <MixAssistPanel
                mix={mix}
                sources={playbackSources}
                listeningMix={listeningMix ?? mix}
                onCommitMix={scheduleMixUpdate}
                onPreviewMix={setMixPreview}
              />
            )}
            <label className="master">
              {t("mix.master")}
              <input
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={mix.masterGainDb}
                onChange={(e) =>
                  scheduleMixUpdate({
                    ...mix,
                    masterGainDb: Number(e.target.value),
                  })
                }
              />
              <span className="mix-value">
                {formatGainDb(mix.masterGainDb)}
              </span>
            </label>
            {mix.tracks.map((tr) => {
              const anySolo = mix.tracks.some((x) => x.solo);
              const muted = tr.mute || (anySolo && !tr.solo);
              const peaks = playback?.peaksByTrack[tr.id] ?? null;
              const waveStatus =
                !playback || playback.loading || !playback.ready
                  ? "loading"
                  : peaks && peaks.length > 0
                    ? "ready"
                    : "empty";
              return (
                <div
                  key={tr.id}
                  className="track"
                  data-role={tr.role.toLowerCase()}
                >
                  <strong className="track-name">{tr.name}</strong>
                  <button
                    type="button"
                    className={tr.mute ? "btn active" : "btn"}
                    onClick={() =>
                      scheduleMixUpdate({
                        ...mix,
                        tracks: mix.tracks.map((x) =>
                          x.id === tr.id ? { ...x, mute: !x.mute } : x,
                        ),
                      })
                    }
                  >
                    {t("mix.mute")}
                  </button>
                  <button
                    type="button"
                    className={tr.solo ? "btn active" : "btn"}
                    onClick={() =>
                      scheduleMixUpdate({
                        ...mix,
                        tracks: mix.tracks.map((x) =>
                          x.id === tr.id ? { ...x, solo: !x.solo } : x,
                        ),
                      })
                    }
                  >
                    {t("mix.solo")}
                  </button>
                  <div className="track-wave">
                    <Waveform
                      peaks={peaks}
                      progress={playback?.current ?? 0}
                      duration={playback?.duration ?? 0}
                      height={40}
                      muted={muted}
                      status={waveStatus}
                      role={tr.role}
                      ariaLabel={tr.name}
                      onSeek={playback?.seek}
                    />
                  </div>
                  <label className="track-gain">
                    <span className="track-fader-label">
                      <span>{t("mix.gain")}</span>
                      <span className="mix-value" aria-hidden>
                        {formatGainDb(tr.gainDb)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={-24}
                      max={12}
                      step={0.5}
                      value={tr.gainDb}
                      aria-label={t("mix.gainNamed", { track: tr.name })}
                      aria-valuetext={formatGainDb(tr.gainDb)}
                      onChange={(e) =>
                        scheduleMixUpdate({
                          ...mix,
                          tracks: mix.tracks.map((x) =>
                            x.id === tr.id
                              ? { ...x, gainDb: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="track-pan">
                    <span className="track-fader-label">
                      <span>{t("mix.pan")}</span>
                      <span className="mix-value" aria-hidden>
                        {formatPan(tr.pan)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={tr.pan}
                      aria-label={t("mix.panNamed", { track: tr.name })}
                      aria-valuetext={formatPan(tr.pan)}
                      onChange={(e) =>
                        scheduleMixUpdate({
                          ...mix,
                          tracks: mix.tracks.map((x) =>
                            x.id === tr.id
                              ? { ...x, pan: Number(e.target.value) }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
            <button
              type="button"
              className="btn"
              onClick={() =>
                void api
                  .saveMixVersion(project.id)
                  .then((m) => setMix(m))
                  .catch((e) => setError(String(e)))
              }
            >
              {t("mix.saveVersion")}
            </button>
          </div>
        ) : (
          <p className="hint">{t("mix.needSeparation")}</p>
        )}
      </div>

      <div
        id="production-panel-clips"
        role="tabpanel"
        aria-labelledby="production-view-clips"
        hidden={productionView !== "clips"}
      >
        {mix ? (
          <div className="production-clips">
            <ClipTimeline
              mix={mix}
              onChange={scheduleMixUpdate}
              peaksByTrack={playback?.peaksByTrack}
              roleByTrack={roleByTrack}
              sourceDurationMsByTrack={sourceDurationMsByTrack}
              projectTempoBpm={project.tempoBpm}
              projectMeter={project.meter ?? null}
            />
          </div>
        ) : (
          <p className="hint">{t("mix.needSeparation")}</p>
        )}
      </div>

      <div
        id="production-panel-tools"
        role="tabpanel"
        aria-labelledby="production-view-tools"
        hidden={productionView !== "tools"}
        className="advanced-production"
      >
        <Phase3MixPanel
          mix={mix}
          sources={playbackSources}
          tempoBpm={form.tempoBpm}
          durationMs={
            form.targetDurationSec != null
              ? form.targetDurationSec * 1000
              : (project.targetDurationSec ?? 180) * 1000
          }
        />
        <ExportWizard
          project={project}
          mix={mix}
          sources={playbackSources}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
        />
      </div>
    </section>
  );
}
