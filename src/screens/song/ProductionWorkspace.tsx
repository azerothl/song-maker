import type { Dispatch, SetStateAction } from "react";
import { ClipTimeline } from "../../components/ClipTimeline";
import { ExportWizard } from "../../components/ExportWizard";
import { MixAssistPanel } from "../../components/MixAssistPanel";
import { MixKnob } from "../../components/MixKnob";
import { Phase3MixPanel } from "../../components/Phase3MixPanel";
import { ProductionAssistPanel } from "../../components/ProductionAssistPanel";
import { RecordTrackPanel } from "../../components/RecordTrackPanel";
import { Waveform } from "../../components/Waveform";
import { t } from "../../ui/i18n";
import type { FormInput, MixDoc, PlaybackSources, ProjectDoc, SeparationInfo } from "../../lib/types";
import type { ScoreGate } from "../../lib/score";
import type { PlaybackView } from "../../components/AudioPlayer";
import {
  formatGainDb,
  formatPan,
  parseGainDb,
  parsePan,
  PRODUCTION_VIEWS,
  productionViewIntro,
  productionViewLabel,
  warningLabel,
  workspaceIntro,
  workspaceTitle,
  type ProductionView,
} from "./shared";

type MixUpdateOpts = { persist?: boolean };

/** Onglet Production : mixage, clips, séparation et outils. */
type ProductionWorkspaceProps = {
  busy: boolean;
  form: FormInput;
  importingAudio: boolean;
  listeningMix: MixDoc | null;
  mix: MixDoc | null;
  mixSavedAt: Date | null;
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
  scheduleMixUpdate: (next: MixDoc | null, opts?: MixUpdateOpts) => void;
  scoreGate: ScoreGate;
  separationInfo: SeparationInfo | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: (e: string | null) => void;
  setMixPreview: Dispatch<SetStateAction<MixDoc | null>>;
  setProductionView: Dispatch<SetStateAction<ProductionView>>;
  setRecordOpen: Dispatch<SetStateAction<boolean>>;
  showMixAssist: boolean;
  showProductionCopilot: boolean;
  sourceDurationMsByTrack: Record<string, number>;
};

function formatSavedClock(at: Date): string {
  const h = at.getHours().toString().padStart(2, "0");
  const m = at.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function patchTrack(
  mix: MixDoc,
  trackId: string,
  patch: Partial<MixDoc["tracks"][number]>,
): MixDoc {
  return {
    ...mix,
    tracks: mix.tracks.map((x) => (x.id === trackId ? { ...x, ...patch } : x)),
  };
}

export function ProductionWorkspace({
  busy,
  form,
  importingAudio,
  listeningMix,
  mix,
  mixSavedAt,
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
  setMixPreview,
  setProductionView,
  setRecordOpen,
  showMixAssist,
  showProductionCopilot,
  sourceDurationMsByTrack,
}: ProductionWorkspaceProps) {
  return (
    <section
      className="song-workspace-panel wide production-workspace"
      role="tabpanel"
      id="song-panel-production"
      aria-labelledby="song-tab-production"
    >
      <header className="song-workspace-heading production-heading-compact">
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

      <p className="hint song-subview-intro production-subview-intro">
        {productionViewIntro(productionView)}
      </p>

      <details className="production-actions-drawer">
        <summary>{t("mix.actions.toggle")}</summary>
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
      </details>

      <div
        id="production-panel-mix"
        role="tabpanel"
        aria-labelledby="production-view-mix"
        hidden={productionView !== "mix"}
      >
        {mix ? (
          <div className="mixer mixer-compact">
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

            <div className="mix-toolbar-row">
              {showMixAssist && (
                <details className="mix-assist-drawer">
                  <summary>{t("mix.assist.drawer")}</summary>
                  <MixAssistPanel
                    mix={mix}
                    sources={playbackSources}
                    listeningMix={listeningMix ?? mix}
                    onCommitMix={(next) => scheduleMixUpdate(next)}
                    onPreviewMix={setMixPreview}
                  />
                </details>
              )}
              {showProductionCopilot && (
                <details className="mix-assist-drawer mix-copilot-drawer">
                  <summary>{t("copilot.title")}</summary>
                  <ProductionAssistPanel
                    mix={mix}
                    sources={playbackSources}
                    scoreIssues={scoreGate.issues}
                    listeningMix={listeningMix ?? mix}
                    onCommitMix={(next) => scheduleMixUpdate(next)}
                    onPreviewMix={setMixPreview}
                  />
                </details>
              )}
              <p className="mix-autosave" aria-live="polite">
                {mixSavedAt
                  ? t("mix.savedAt", { time: formatSavedClock(mixSavedAt) })
                  : "\u00a0"}
              </p>
            </div>

            <div
              className="mix-master-banner"
              aria-label={t("mix.masterBanner")}
            >
              <div className="mix-master-wave">
                <Waveform
                  peaks={playback?.mixPeaks ?? null}
                  progress={playback?.current ?? 0}
                  duration={playback?.duration ?? 0}
                  height={36}
                  status={
                    !playback || playback.loading || !playback.ready
                      ? "loading"
                      : playback.mixPeaks && playback.mixPeaks.length > 0
                        ? "ready"
                        : "empty"
                  }
                  ariaLabel={t("mix.master")}
                  onSeek={playback?.seek}
                />
              </div>
              <button
                type="button"
                className="btn mix-master-play"
                disabled={!playback?.ready || playback.loading}
                onClick={() => void playback?.toggle().catch((e) => setError(String(e)))}
              >
                {playback?.loading
                  ? "…"
                  : playback?.playing
                    ? t("player.pause")
                    : t("player.play")}
              </button>
              <MixKnob
                className="mix-master-knob"
                value={mix.masterGainDb}
                min={-24}
                max={12}
                step={0.5}
                defaultValue={0}
                ariaLabel={t("mix.master")}
                valueText={formatGainDb(mix.masterGainDb)}
                displayValue={formatGainDb(mix.masterGainDb)}
                parseDisplay={parseGainDb}
                onChange={(gainDb) =>
                  scheduleMixUpdate({ ...mix, masterGainDb: gainDb }, { persist: false })
                }
                onCommit={(gainDb) =>
                  scheduleMixUpdate({ ...mix, masterGainDb: gainDb })
                }
              />
            </div>

            <div className="mixer-tracks">
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
                    <div className="track-ms" role="group" aria-label={tr.name}>
                      <button
                        type="button"
                        className={
                          tr.mute ? "btn track-ms-btn active pressed" : "btn track-ms-btn"
                        }
                        aria-pressed={tr.mute}
                        aria-label={t("mix.muteNamed", { track: tr.name })}
                        onClick={() =>
                          scheduleMixUpdate(patchTrack(mix, tr.id, { mute: !tr.mute }))
                        }
                      >
                        <span className="track-ms-glyph" aria-hidden>
                          {t("mix.mute")}
                        </span>
                        {tr.mute && (
                          <span className="track-ms-state" aria-hidden>
                            ●
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className={
                          tr.solo ? "btn track-ms-btn active pressed" : "btn track-ms-btn"
                        }
                        aria-pressed={tr.solo}
                        aria-label={t("mix.soloNamed", { track: tr.name })}
                        onClick={() =>
                          scheduleMixUpdate(patchTrack(mix, tr.id, { solo: !tr.solo }))
                        }
                      >
                        <span className="track-ms-glyph" aria-hidden>
                          {t("mix.solo")}
                        </span>
                        {tr.solo && (
                          <span className="track-ms-state" aria-hidden>
                            ●
                          </span>
                        )}
                      </button>
                    </div>
                    <MixKnob
                      className="track-gain-knob"
                      value={tr.gainDb}
                      min={-24}
                      max={12}
                      step={0.5}
                      defaultValue={0}
                      ariaLabel={t("mix.gainNamed", { track: tr.name })}
                      valueText={formatGainDb(tr.gainDb)}
                      displayValue={formatGainDb(tr.gainDb)}
                      parseDisplay={parseGainDb}
                      onChange={(gainDb) =>
                        scheduleMixUpdate(patchTrack(mix, tr.id, { gainDb }), {
                          persist: false,
                        })
                      }
                      onCommit={(gainDb) =>
                        scheduleMixUpdate(patchTrack(mix, tr.id, { gainDb }))
                      }
                    />
                    <MixKnob
                      className="track-pan-knob"
                      value={tr.pan}
                      min={-1}
                      max={1}
                      step={0.01}
                      fineStep={0.01}
                      defaultValue={0}
                      ariaLabel={t("mix.panNamed", { track: tr.name })}
                      valueText={formatPan(tr.pan)}
                      displayValue={formatPan(tr.pan)}
                      parseDisplay={parsePan}
                      onChange={(pan) =>
                        scheduleMixUpdate(patchTrack(mix, tr.id, { pan }), {
                          persist: false,
                        })
                      }
                      onCommit={(pan) =>
                        scheduleMixUpdate(patchTrack(mix, tr.id, { pan }))
                      }
                    />
                    <div className="track-wave">
                      <Waveform
                        peaks={peaks}
                        progress={playback?.current ?? 0}
                        duration={playback?.duration ?? 0}
                        height={32}
                        muted={muted}
                        status={waveStatus}
                        role={tr.role}
                        ariaLabel={tr.name}
                        onSeek={playback?.seek}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
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
