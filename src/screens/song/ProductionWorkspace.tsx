import {
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  SetStateAction,
} from "react";
import { ClipTimeline } from "../../components/ClipTimeline";
import { ExportWizard } from "../../components/ExportWizard";
import { ExportTracksPopin } from "../../components/ExportTracksPopin";
import { EstimatedSeparationMarker } from "../../components/EstimatedSeparationMarker";
import { AnchoredPopin } from "../../components/AnchoredPopin";
import { MixAssistPanel } from "../../components/MixAssistPanel";
import { MixKnob } from "../../components/MixKnob";
import { Phase3MixPanel } from "../../components/Phase3MixPanel";
import { ProductionAssistPanel } from "../../components/ProductionAssistPanel";
import { RecordTrackPanel } from "../../components/RecordTrackPanel";
import { Waveform } from "../../components/Waveform";
import { t } from "../../ui/i18n";
import {
  buildTrackFamilyGroups,
  groupMutePressed,
  groupSoloPressed,
  isExperimentalStemTrack,
  loadCollapsedTrackFamilies,
  loadProductionTrackDensity,
  saveCollapsedTrackFamily,
  saveProductionTrackDensity,
  shouldUseProductionTightLayout,
  waveHeightForDensity,
  type ProductionTrackDensity,
  type TrackFamilyId,
} from "../../lib/productionTrackLayout";
import type {
  FormInput,
  MixDoc,
  MixTrack,
  PlaybackSources,
  ProjectDoc,
  SeparationInfo,
} from "../../lib/types";
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
  onRevertSeparation?: () => void;
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

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function patchTrack(
  mix: MixDoc,
  trackId: string,
  patch: Partial<MixTrack>,
): MixDoc {
  return {
    ...mix,
    tracks: mix.tracks.map((x) => (x.id === trackId ? { ...x, ...patch } : x)),
  };
}

function patchTracks(mix: MixDoc, trackIds: string[], patch: Partial<MixTrack>): MixDoc {
  const ids = new Set(trackIds);
  return {
    ...mix,
    tracks: mix.tracks.map((x) => (ids.has(x.id) ? { ...x, ...patch } : x)),
  };
}

function familyLabel(family: TrackFamilyId): string {
  return t(`mix.group.${family}`);
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
  onRevertSeparation,
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
  const hasAiStems = mix?.tracks.some((tr) => tr.aiSeparated) ?? false;
  const splitTransport =
    playbackSources?.mode === "stems" && hasAiStems;

  const mixAssistBtnRef = useRef<HTMLButtonElement>(null);
  const copilotBtnRef = useRef<HTMLButtonElement>(null);
  const [mixAssistOpen, setMixAssistOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [density, setDensity] = useState<ProductionTrackDensity>(() =>
    loadProductionTrackDensity(),
  );
  const [collapsedFamilies, setCollapsedFamilies] = useState<Record<string, boolean>>(
    () => loadCollapsedTrackFamilies(),
  );
  const mixAssistTitleId = useId();
  const copilotTitleId = useId();

  const trackGroups = useMemo(
    () => (mix ? buildTrackFamilyGroups(mix.tracks) : []),
    [mix],
  );
  const waveHeight = waveHeightForDensity(density);
  const tightMixLayout = shouldUseProductionTightLayout(productionView, density);
  const masterWaveHeight = tightMixLayout ? 32 : 38;

  const setDensityPersist = (next: ProductionTrackDensity) => {
    setDensity(next);
    saveProductionTrackDensity(next);
  };

  const toggleFamilyCollapsed = (family: TrackFamilyId) => {
    setCollapsedFamilies((prev) => {
      const collapsed = !prev[family];
      saveCollapsedTrackFamily(family, collapsed);
      return { ...prev, [family]: collapsed };
    });
  };

  return (
    <section
      className={
        tightMixLayout
          ? "song-workspace-panel wide production-workspace production-workspace-tight"
          : "song-workspace-panel wide production-workspace"
      }
      role="tabpanel"
      id="song-panel-production"
      aria-labelledby="song-tab-production"
    >
      <div className="production-chrome-stack">
        <div className="production-chrome-row">
          <header className="song-workspace-heading production-heading-compact">
            <h2>{workspaceTitle("production")}</h2>
            <p className="hint">{workspaceIntro("production")}</p>
          </header>

          <nav
            className="song-subnav production-subnav"
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
        </div>

        <p className="hint song-subview-intro production-subview-intro">
          {productionViewIntro(productionView)}
        </p>

        <details className="production-actions-drawer" data-default-closed>
        <summary>{t("mix.actions.toggle")}</summary>
        <div className="production-global-actions">
          <div className="song-actions">
            <div className="btn-row song-actions-primary">
              <button
                type="button"
                className={hasAiStems ? "btn" : "btn primary"}
                disabled={!project.activeGenerationId || busy}
                onClick={() => void onSeparate()}
              >
                {hasAiStems ? t("separate.again") : t("separate.button")}
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
              <ExportTracksPopin
                projectId={project.id}
                mix={mix}
                busy={busy}
                onBusy={setBusy}
                onError={setError}
              />
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
      </div>

      <div
        id="production-panel-mix"
        role="tabpanel"
        aria-labelledby="production-view-mix"
        hidden={productionView !== "mix"}
      >
        {mix ? (
          <div
            className="mixer mixer-density production-mix-panel"
            data-density={density}
          >
            {onRevertSeparation && (
              <div className="banner info separation-undo-banner" role="status">
                <p>{t("separation.revert.hint")}</p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={onRevertSeparation}
                >
                  {t("separation.revert.action")}
                </button>
              </div>
            )}

            <div className="production-mix-sticky-master">
              <div
                className={
                  splitTransport
                    ? "mix-master-banner mix-master-banner-split production-mix-master"
                    : "mix-master-banner production-mix-master"
                }
                aria-label={t("mix.masterBanner")}
              >
                <button
                  type="button"
                  className="btn mix-master-play"
                  disabled={!playback?.ready || playback.loading}
                  onClick={() =>
                    void playback?.toggle().catch((e) => setError(String(e)))
                  }
                >
                  {playback?.loading
                    ? "…"
                    : playback?.playing
                      ? t("player.pause")
                      : t("player.play")}
                </button>
                {splitTransport && (
                  <div
                    className="mix-master-times"
                    aria-label={t("player.seek")}
                  >
                    <span className="player-time">
                      {formatPlaybackTime(playback?.current ?? 0)}
                    </span>
                    <span className="player-time-sep">/</span>
                    <span className="player-time">
                      {formatPlaybackTime(playback?.duration ?? 0)}
                    </span>
                  </div>
                )}
                <div className="mix-master-wave">
                  <Waveform
                    peaks={playback?.mixPeaks ?? null}
                    progress={playback?.current ?? 0}
                    duration={playback?.duration ?? 0}
                    height={masterWaveHeight}
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
              <div
                className="production-mix-toolbar production-mix-toolbar-sticky"
                role="toolbar"
                aria-label={t("workspace.production.mix")}
              >
                <div className="production-mix-toolbar-title">
                  <h3 className="mixer-tracks-title">{t("mix.tracksTitle")}</h3>
                  {separationInfo && separationInfo.warnings.length > 0 && (
                    <EstimatedSeparationMarker warningCodes={separationInfo.warnings} />
                  )}
                </div>
                <div
                  className="production-density-seg"
                  role="group"
                  aria-label={t("mix.density.group")}
                >
                  <button
                    type="button"
                    className="production-density-btn"
                    aria-pressed={density === "compact"}
                    onClick={() => setDensityPersist("compact")}
                  >
                    <span className="production-density-check" aria-hidden>
                      ✓
                    </span>
                    {t("mix.density.compact")}
                  </button>
                  <button
                    type="button"
                    className="production-density-btn"
                    aria-pressed={density === "confortable"}
                    onClick={() => setDensityPersist("confortable")}
                  >
                    <span className="production-density-check" aria-hidden>
                      ✓
                    </span>
                    {t("mix.density.confortable")}
                  </button>
                </div>
                <div className="production-mix-toolbar-actions">
                  {showMixAssist && (
                    <>
                      <button
                        ref={mixAssistBtnRef}
                        type="button"
                        className="btn mix-assist-trigger"
                        aria-expanded={mixAssistOpen}
                        aria-controls="mix-assist-popin"
                        aria-haspopup="dialog"
                        onClick={() => setMixAssistOpen((v) => !v)}
                      >
                        {t("mix.assist.drawer")}
                      </button>
                      <AnchoredPopin
                        open={mixAssistOpen}
                        onClose={() => setMixAssistOpen(false)}
                        anchorRef={mixAssistBtnRef}
                        labelId={mixAssistTitleId}
                        className="mix-assist-popin"
                      >
                        <header className="anchored-popin-header">
                          <h3 id={mixAssistTitleId}>{t("mix.assist.title")}</h3>
                        </header>
                        <MixAssistPanel
                          mix={mix}
                          sources={playbackSources}
                          listeningMix={listeningMix ?? mix}
                          onCommitMix={(next) => scheduleMixUpdate(next)}
                          onPreviewMix={setMixPreview}
                        />
                      </AnchoredPopin>
                    </>
                  )}
                  {showProductionCopilot && (
                    <>
                      <button
                        ref={copilotBtnRef}
                        type="button"
                        className="btn mix-assist-trigger"
                        aria-expanded={copilotOpen}
                        aria-haspopup="dialog"
                        onClick={() => setCopilotOpen((v) => !v)}
                      >
                        {t("copilot.title")}
                      </button>
                      <AnchoredPopin
                        open={copilotOpen}
                        onClose={() => setCopilotOpen(false)}
                        anchorRef={copilotBtnRef}
                        labelId={copilotTitleId}
                        className="mix-copilot-popin"
                      >
                        <header className="anchored-popin-header">
                          <h3 id={copilotTitleId}>{t("copilot.title")}</h3>
                        </header>
                        <ProductionAssistPanel
                          mix={mix}
                          sources={playbackSources}
                          scoreIssues={scoreGate.issues}
                          listeningMix={listeningMix ?? mix}
                          onCommitMix={(next) => scheduleMixUpdate(next)}
                          onPreviewMix={setMixPreview}
                        />
                      </AnchoredPopin>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={!project.activeGenerationId || busy}
                    onClick={() => void onSeparate()}
                  >
                    {hasAiStems ? t("separate.again") : t("separate.button")}
                  </button>
                  <ExportTracksPopin
                    projectId={project.id}
                    mix={mix}
                    busy={busy}
                    onBusy={setBusy}
                    onError={setError}
                  />
                </div>
                <p className="mix-autosave production-mix-saved" role="status">
                  {mixSavedAt
                    ? t("mix.savedAt", { time: formatSavedClock(mixSavedAt) })
                    : "\u00a0"}
                </p>
              </div>
            </div>

            <div className="production-mix-scroll">
              {!tightMixLayout && (
                <div
                  className="production-mix-colheaders production-mix-grid"
                  aria-hidden="true"
                >
                  <span>{t("mix.columns.track")}</span>
                  <span>{t("mix.columns.gain")}</span>
                  <span>{t("mix.columns.pan")}</span>
                  <span>{t("mix.columns.ms")}</span>
                  <span>{t("mix.columns.waveform")}</span>
                </div>
              )}

              <div className="production-mix-list" role="list" aria-label={t("mix.tracksTitle")}>
                {(() => {
                  const anySolo = mix.tracks.some((x) => x.solo);
                  const renderTrack = (tr: MixTrack, inGroup: boolean) => {
                    const muted = tr.mute || (anySolo && !tr.solo);
                    const implicit = anySolo && !tr.solo && !tr.mute;
                    const peaks = playback?.peaksByTrack[tr.id] ?? null;
                    const waveStatus =
                      !playback || playback.loading || !playback.ready
                        ? "loading"
                        : peaks && peaks.length > 0
                          ? "ready"
                          : "empty";
                    const experimental = isExperimentalStemTrack(tr);
                    const rowClass = [
                      "production-mix-grid",
                      "production-mix-row",
                      "track",
                      inGroup ? "production-mix-row-grouped" : "",
                      muted ? "track-muted" : "",
                      implicit ? "track-implicit-muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={tr.id}
                        className={rowClass}
                        data-role={tr.role.toLowerCase()}
                        role="listitem"
                      >
                        <div className="production-mix-name">
                          <span className="production-mix-strip" aria-hidden />
                          <span className="production-mix-track-label" title={tr.name}>
                            {tr.name}
                            {experimental && (
                              <>
                                <span aria-hidden> *</span>
                                <span className="sr-only">
                                  {" "}
                                  ({t("mix.experimentalStem")})
                                </span>
                              </>
                            )}
                          </span>
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
                        <div className="track-ms" role="group" aria-label={tr.name}>
                          <button
                            type="button"
                            className={
                              tr.mute
                                ? "btn track-ms-btn track-ms-btn-m pressed"
                                : "btn track-ms-btn track-ms-btn-m"
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
                          </button>
                          <button
                            type="button"
                            className={
                              tr.solo
                                ? "btn track-ms-btn track-ms-btn-s pressed"
                                : "btn track-ms-btn track-ms-btn-s"
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
                          </button>
                        </div>
                        <div className="track-wave production-mix-wave">
                          <Waveform
                            peaks={peaks}
                            progress={playback?.current ?? 0}
                            duration={playback?.duration ?? 0}
                            height={waveHeight}
                            muted={muted}
                            status={waveStatus}
                            role={tr.role}
                            ariaLabel={tr.name}
                            onSeek={playback?.seek}
                          />
                        </div>
                      </div>
                    );
                  };

                  return trackGroups.map((group) => {
                    const groupId = `production-group-${group.family}`;
                    const collapsed = Boolean(collapsedFamilies[group.family]);
                    const groupName = familyLabel(group.family);
                    const trackIds = group.tracks.map((tr) => tr.id);
                    const gMute = groupMutePressed(group.tracks);
                    const gSolo = groupSoloPressed(group.tracks);
                    const collapsedNames = group.tracks.map((tr) => tr.name).join(", ");
                    return (
                      <div key={group.family} className="production-mix-family">
                        <div
                          className="production-mix-grid production-mix-group-header"
                          role="listitem"
                        >
                          <div className="production-mix-group-name">
                            <button
                              type="button"
                              className="production-mix-group-toggle"
                              aria-expanded={!collapsed}
                              aria-controls={groupId}
                              onClick={() => toggleFamilyCollapsed(group.family)}
                            >
                              <span className="production-mix-chevron" aria-hidden>
                                ›
                              </span>
                              {groupName}
                              <span className="production-mix-group-count">
                                {t("mix.group.trackCount", {
                                  count: group.tracks.length,
                                })}
                              </span>
                            </button>
                          </div>
                          <div
                            className="track-ms production-mix-group-ms"
                            role="group"
                            aria-label={groupName}
                          >
                            <button
                              type="button"
                              className={
                                gMute
                                  ? "btn track-ms-btn track-ms-btn-m pressed"
                                  : "btn track-ms-btn track-ms-btn-m"
                              }
                              aria-pressed={gMute}
                              aria-label={t("mix.group.muteNamed", { group: groupName })}
                              onClick={() => {
                                scheduleMixUpdate(
                                  patchTracks(mix, trackIds, { mute: !gMute }),
                                );
                              }}
                            >
                              <span className="track-ms-glyph" aria-hidden>
                                {t("mix.mute")}
                              </span>
                            </button>
                            <button
                              type="button"
                              className={
                                gSolo
                                  ? "btn track-ms-btn track-ms-btn-s pressed"
                                  : "btn track-ms-btn track-ms-btn-s"
                              }
                              aria-pressed={gSolo}
                              aria-label={t("mix.group.soloNamed", { group: groupName })}
                              onClick={() => {
                                scheduleMixUpdate(
                                  patchTracks(mix, trackIds, { solo: !gSolo }),
                                );
                              }}
                            >
                              <span className="track-ms-glyph" aria-hidden>
                                {t("mix.solo")}
                              </span>
                            </button>
                          </div>
                          {collapsed ? (
                            <p className="production-mix-group-summary">
                              {t("mix.group.collapsedSummary", {
                                count: group.tracks.length,
                                names: collapsedNames,
                              })}
                            </p>
                          ) : (
                            <span
                              className="production-mix-group-wave-pad"
                              aria-hidden
                            />
                          )}
                        </div>
                        <div
                          id={groupId}
                          className="production-mix-group-tracks"
                          role="list"
                          aria-label={groupName}
                          hidden={collapsed}
                        >
                          {group.tracks.map((tr) => renderTrack(tr, true))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
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
