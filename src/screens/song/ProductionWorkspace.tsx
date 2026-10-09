import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  SetStateAction,
} from "react";
import { TruncatedTrackLabel } from "../../components/TruncatedTrackLabel";
import { ClipTimeline } from "../../components/ClipTimeline";
import { ExportDialog } from "../../components/ExportDialog";
import { SeparationRecommendDialog } from "../../components/SeparationRecommendDialog";
import { EstimatedSeparationMarker } from "../../components/EstimatedSeparationMarker";
import { AnchoredPopin } from "../../components/AnchoredPopin";
import { ProductionMixSettingsPopin } from "../../components/ProductionMixSettingsPopin";
import { MixSlider } from "../../components/MixSlider";
import {
  ClipEditToolbar,
  clipEditToolFromKey,
  type ClipEditTool,
} from "../../components/ClipEditToolbar";
import { ProductionAssistPanel } from "../../components/ProductionAssistPanel";
import { QwenMixAssistant } from "../../components/QwenMixAssistant";
import { RecordTrackPanel } from "../../components/RecordTrackPanel";
import { ProductionAddTrackMenu } from "../../components/production/ProductionAddTrackMenu";
import { ProductionTrackTools } from "../../components/production/ProductionTrackTools";
import { ProductionTrackAutomation } from "../../components/production/ProductionTrackAutomation";
import { MixBakeStatusIndicator } from "../../components/MixBakeStatusIndicator";
import { PlaybackTime } from "../../components/PlaybackTime";
import { Waveform } from "../../components/Waveform";
import { t } from "../../ui/i18n";
import { useAppStore } from "../../store/appStore";
import {
  planProjectInstrumentalPart,
  type InstrumentalConditioning,
  type InstrumentalRole,
} from "../../lib/projectInstrumental";
import {
  buildTrackFamilyGroups,
  groupMutePressed,
  groupSoloPressed,
  isExperimentalStemTrack,
  effectiveDensityFromPreference,
  loadCollapsedTrackFamilies,
  loadProductionDensityPreference,
  saveCollapsedTrackFamily,
  saveProductionDensityPreference,
  shouldUseCompactForAutoDensity,
  shouldUseProductionTightLayout,
  type ProductionDensityPreference,
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
import {
  formatMixGroupCollapsedSummary,
  formatMixGroupTrackCount,
} from "../../lib/mixGroupTrackCount";
import {
  DEFAULT_PRODUCTION_CLIP_VIEW_PREFS,
  useProductionMixLayoutNarrow,
  type ProductionClipViewPrefs,
} from "../../lib/productionClipViewPrefs";
import { MixAssistPanel } from "../../components/MixAssistPanel";
import { PopinCloseButton } from "../../components/PopinCloseButton";
import type { ScoreGate } from "../../lib/score";
import type { PlaybackView } from "../../components/AudioPlayer";
import { separationAudioDurationSec } from "../../lib/separationDuration";
import {
  formatGainDb,
  formatPan,
  parseGainDb,
  parsePan,
  workspaceTitle,
} from "./shared";
import {
  mixPeakAtPlayhead,
  mixPeakPercent,
} from "../../lib/productionMasterMeter";

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
  onAddMidiTrack?: () => void;
  onEditMidiTrack?: (trackId: string, trackName: string) => void;
  onSeparate: () => Promise<void>;
  onRevertSeparation?: () => void;
  onUserTrackAdded: (next: MixDoc) => Promise<void>;
  onRequestInstrumentalPart?: (input: {
    role: "bass" | "drums" | "other";
    conditioning: "project_metadata" | "mix_stems";
  }) => Promise<void>;
  legoSidecarReady?: boolean;
  legoLicenseAccepted?: boolean;
  playback: PlaybackView | null;
  playbackSources: PlaybackSources | null;
  project: ProjectDoc;
  recordOpen: boolean;
  roleByTrack: Record<string, string>;
  scheduleMixUpdate: (next: MixDoc | null, opts?: MixUpdateOpts) => void;
  scoreGate: ScoreGate;
  separationInfo: SeparationInfo | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: (e: string | null) => void;
  setMixPreview: Dispatch<SetStateAction<MixDoc | null>>;
  setRecordOpen: Dispatch<SetStateAction<boolean>>;
  showMixAssist: boolean;
  showProductionCopilot: boolean;
  sourceDurationMsByTrack: Record<string, number>;
  /** Harness capture : pistes de groupes repliés peintes hors écran pour métriques canvas (#159). */
  capturePaintCollapsedTracks?: boolean;
  clipViewPrefs?: ProductionClipViewPrefs;
  onClipViewPrefsChange?: (patch: Partial<ProductionClipViewPrefs>) => void;
  onTranscribeBasicPitch?: (track: MixTrack) => void;
  transcribingTrackId?: string | null;
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
  onExport: _onExport,
  onImportUserAudio,
  onAddMidiTrack,
  onEditMidiTrack,
  onSeparate,
  onRevertSeparation,
  onUserTrackAdded,
  onRequestInstrumentalPart,
  legoSidecarReady = false,
  legoLicenseAccepted = false,
  playback,
  playbackSources,
  project,
  recordOpen,
  roleByTrack,
  scheduleMixUpdate,
  scoreGate,
  separationInfo,
  setBusy,
  setError,
  setMixPreview,
  setRecordOpen,
  showMixAssist,
  showProductionCopilot,
  sourceDurationMsByTrack,
  capturePaintCollapsedTracks = false,
  clipViewPrefs: clipViewPrefsProp,
  onClipViewPrefsChange,
  onTranscribeBasicPitch,
  transcribingTrackId = null,
}: ProductionWorkspaceProps) {
  const hasAiStems = mix?.tracks.some((tr) => tr.aiSeparated) ?? false;
  const separationAudioSec = useMemo(
    () =>
      separationAudioDurationSec({
        project,
        mix,
        playbackDurationSec: playback?.duration ?? null,
        sourceDurationMsByTrack,
      }),
    [project, mix, playback?.duration, sourceDurationMsByTrack],
  );

  const mixAssistBtnRef = useRef<HTMLButtonElement>(null);
  const separateAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mixSettingsAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mixSettingsBtnRef = useRef<HTMLButtonElement>(null);
  const [mixSettingsOpen, setMixSettingsOpen] = useState(false);
  const [editTool, setEditTool] = useState<ClipEditTool>("select");
  const [instrumentalOpen, setInstrumentalOpen] = useState(false);
  const [instrumentalRole, setInstrumentalRole] =
    useState<InstrumentalRole>("bass");
  const [instrumentalCond, setInstrumentalCond] =
    useState<InstrumentalConditioning>("project_metadata");
  const [instrumentalNotice, setInstrumentalNotice] = useState<string | null>(
    null,
  );
  const mixLayoutNarrow = useProductionMixLayoutNarrow();
  const [localClipViewPrefs, setLocalClipViewPrefs] = useState<ProductionClipViewPrefs>(
    () => DEFAULT_PRODUCTION_CLIP_VIEW_PREFS,
  );
  const clipViewPrefs = clipViewPrefsProp ?? localClipViewPrefs;
  const patchClipViewPrefs = (patch: Partial<ProductionClipViewPrefs>) => {
    if (clipViewPrefsProp && onClipViewPrefsChange) {
      onClipViewPrefsChange(patch);
      return;
    }
    setLocalClipViewPrefs((prev) => ({ ...prev, ...patch }));
  };
  const [separateOpen, setSeparateOpen] = useState(false);
  const mixScrollRef = useRef<HTMLDivElement>(null);
  const [mixAssistOpen, setMixAssistOpen] = useState(false);
  const [densityPreference, setDensityPreference] = useState<ProductionDensityPreference>(
    () => loadProductionDensityPreference(),
  );
  const [autoResolvedDensity, setAutoResolvedDensity] =
    useState<ProductionTrackDensity>("confortable");
  const effectiveDensity = effectiveDensityFromPreference(
    densityPreference,
    autoResolvedDensity,
  );
  const [collapsedFamilies, setCollapsedFamilies] = useState<Record<string, boolean>>(
    () => loadCollapsedTrackFamilies(),
  );
  const mixAssistTitleId = useId();
  const [openTrackToolsId, setOpenTrackToolsId] = useState<string | null>(null);
  const mixSettingsLabelId = useId();
  const mixSettingsPanelId = useId();

  const openSeparateFrom = (button: HTMLButtonElement | null) => {
    if (!button) return;
    separateAnchorRef.current = button;
    setSeparateOpen(true);
  };

  const openMixAssistFrom = (button: HTMLButtonElement | null) => {
    if (!button) return;
    mixAssistBtnRef.current = button;
    setMixAssistOpen((open) => !open);
  };


  const toggleMixSettingsFrom = (button: HTMLButtonElement | null) => {
    if (!button) return;
    mixSettingsAnchorRef.current = button;
    setMixSettingsOpen((open) => !open);
  };

  const mixSettingsTrigger = (
    <button
      ref={mixSettingsBtnRef}
      type="button"
      className="btn production-mix-settings-trigger"
      data-testid="production-mix-settings-trigger"
      aria-haspopup="dialog"
      aria-expanded={mixSettingsOpen}
      aria-controls={mixSettingsPanelId}
      disabled={!mix}
      title={!mix ? t("production.mixSettings.needTracks") : undefined}
      onClick={() => toggleMixSettingsFrom(mixSettingsBtnRef.current)}
    >
      {t("production.mixSettings")}
    </button>
  );

  const separateDisabled = !project.activeGenerationId || busy;
  const separateDisabledReason = busy
    ? t("production.separate.disabledBusy")
    : !project.activeGenerationId
      ? t("production.separate.disabledNoGeneration")
      : undefined;

  const mixSettingsDeferEscape =
    mixAssistOpen || separateOpen;

  const trackGroups = useMemo(
    () => (mix ? buildTrackFamilyGroups(mix.tracks) : []),
    [mix],
  );
  const tightMixLayout = shouldUseProductionTightLayout(effectiveDensity);
  const masterWaveHeight = 36;

  const setDensityPreferencePersist = (next: ProductionDensityPreference) => {
    setDensityPreference(next);
    saveProductionDensityPreference(next);
  };

  const layoutMeasureKey = useMemo(
    () =>
      JSON.stringify({
        tracks: mix?.tracks.length ?? 0,
        collapsedFamilies,
        groups: trackGroups.map((g) => g.tracks.length),
      }),
    [mix?.tracks.length, collapsedFamilies, trackGroups],
  );

  useLayoutEffect(() => {
    if (densityPreference !== "auto") return;
    setAutoResolvedDensity("confortable");
  }, [densityPreference, layoutMeasureKey]);

  useLayoutEffect(() => {
    if (densityPreference !== "auto") return;
    const el = mixScrollRef.current;
    if (!el) return;
    if (
      autoResolvedDensity === "confortable" &&
      shouldUseCompactForAutoDensity(el.scrollHeight, el.clientHeight)
    ) {
      setAutoResolvedDensity("compact");
    }
  }, [densityPreference, autoResolvedDensity, layoutMeasureKey]);

  useEffect(() => {
    if (densityPreference !== "auto") return;
    const el = mixScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setAutoResolvedDensity("confortable");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [densityPreference, layoutMeasureKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      // Sticky chrome sits outside ClipTimeline: keep PageDown/PageUp scrolling the page.
      if (
        (e.key === "PageDown" || e.key === "PageUp") &&
        target?.closest(".production-main-toolbar, .production-chrome-stack")
      ) {
        const root = target.closest<HTMLElement>(".production-workspace-common");
        if (root && root.scrollHeight > root.clientHeight) {
          e.preventDefault();
          const step = Math.max(48, Math.floor(root.clientHeight * 0.85));
          const max = root.scrollHeight - root.clientHeight;
          root.scrollTop =
            e.key === "PageDown"
              ? Math.min(max, root.scrollTop + step)
              : Math.max(0, root.scrollTop - step);
          return;
        }
      }
      const tool = clipEditToolFromKey(e.key);
      if (!tool) return;
      e.preventDefault();
      setEditTool(tool);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
          ? "song-workspace-panel wide production-workspace production-workspace-common production-workspace-tight production-workspace-maquette"
          : "song-workspace-panel wide production-workspace production-workspace-common production-workspace-maquette"
      }
      role="tabpanel"
      id="song-panel-production"
      aria-labelledby="song-tab-production"
    >
      <div className="production-chrome-stack">
        <header className="song-workspace-heading production-heading-compact">
          <h2>{workspaceTitle("production")}</h2>
        </header>
        <MixBakeStatusIndicator
          pending={playback?.mixBakePending ?? false}
          failed={playback?.mixBakeFailed ?? false}
          className="production-mix-bake-chrome"
        />
        <div
          className="production-main-toolbar"
          role="toolbar"
          aria-label={t("production.edit.title")}
        >
          <ClipEditToolbar editTool={editTool} onEditToolChange={setEditTool} />
          <div className="production-main-toolbar-actions">
            <button
              type="button"
              className="btn production-separate-trigger"
              data-testid="production-separate-trigger"
              disabled={separateDisabled}
              aria-describedby={separateDisabledReason ? "production-separate-reason" : undefined}
              onClick={(event) => openSeparateFrom(event.currentTarget)}
            >
              {hasAiStems ? t("separate.again") : t("separate.button")}
            </button>
            <ProductionAddTrackMenu
              busy={busy}
              importingAudio={importingAudio}
              recordOpen={recordOpen}
              onImport={() => void onImportUserAudio()}
              onToggleRecord={() => setRecordOpen((v) => !v)}
              onAddMidiTrack={onAddMidiTrack}
              onAddInstrumentalPart={
                onRequestInstrumentalPart
                  ? () => {
                      setInstrumentalNotice(null);
                      setInstrumentalOpen(true);
                    }
                  : undefined
              }
            />
            {mix ? (
              <ExportDialog
                project={project}
                mix={mix}
                sources={playbackSources}
                busy={busy}
                onBusy={setBusy}
                onError={setError}
                onOpen={() => {
                  setMixSettingsOpen(false);
                  setMixAssistOpen(false);
                  setSeparateOpen(false);
                  setOpenTrackToolsId(null);
                }}
                initialMode={hasAiStems ? "stems" : "mix"}
              />
            ) : null}
            {mixSettingsTrigger}
          </div>
        </div>
        {separateDisabledReason && <p id="production-separate-reason" className="hint">{separateDisabledReason}</p>}
        <RecordTrackPanel
          projectId={project.id}
          open={recordOpen}
          mix={mix}
          clipViewPrefs={clipViewPrefs}
          onClose={() => setRecordOpen(false)}
          onTrackAdded={(m) => void onUserTrackAdded(m)}
          onError={setError}
        />
        {instrumentalOpen && onRequestInstrumentalPart ? (
          <div className="production-instrumental-panel" role="dialog" aria-labelledby="instrumental-part-title">
            <h3 id="instrumental-part-title">{t("production.instrumental.title")}</h3>
            <p className="hint">{t("production.instrumental.intro")}</p>
            {instrumentalCond === "mix_stems" ? (
              <p className="hint warn" role="note">
                {t("production.instrumental.legoHonesty")}
              </p>
            ) : null}
            <label className="invariant-level">
              {t("production.instrumental.role")}
              <select
                value={instrumentalRole}
                onChange={(e) =>
                  setInstrumentalRole(e.target.value as InstrumentalRole)
                }
              >
                <option value="bass">{t("production.instrumental.role.bass")}</option>
                <option value="drums">{t("production.instrumental.role.drums")}</option>
                <option value="other">{t("production.instrumental.role.other")}</option>
              </select>
            </label>
            <fieldset className="settings-engine-options">
              <legend>{t("production.instrumental.conditioning")}</legend>
              <label className="settings-engine-option">
                <input
                  type="radio"
                  name="instrumental-cond"
                  checked={instrumentalCond === "project_metadata"}
                  onChange={() => setInstrumentalCond("project_metadata")}
                />
                <span>{t("production.instrumental.conditioning.meta")}</span>
              </label>
              <label className="settings-engine-option">
                <input
                  type="radio"
                  name="instrumental-cond"
                  checked={instrumentalCond === "mix_stems"}
                  onChange={() => setInstrumentalCond("mix_stems")}
                />
                <span>{t("production.instrumental.conditioning.mix")}</span>
              </label>
            </fieldset>
            {instrumentalCond === "mix_stems" && !mix?.tracks.length && <p className="hint" role="status">{t("production.instrumental.needAudio")}</p>}
            {instrumentalCond === "mix_stems" && (!legoSidecarReady || !legoLicenseAccepted) && (
              <div className="hint" role="status">
                <p>{t("production.instrumental.installRequired")}</p>
                <button type="button" className="btn" onClick={() => useAppStore.getState().openModelSettings("lego")}>
                  {t("production.instrumental.openSettings")}
                </button>
              </div>
            )}
            {instrumentalNotice ? (
              <p className="hint warn" role="status">
                {instrumentalNotice}
              </p>
            ) : null}
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy || (instrumentalCond === "mix_stems" && (!mix?.tracks.length || !legoSidecarReady || !legoLicenseAccepted))}
                onClick={() => {
                  const plan = planProjectInstrumentalPart({
                    role: instrumentalRole,
                    conditioning: instrumentalCond,
                    style: form.style,
                    tempoBpm: form.tempoBpm,
                    key: form.key ?? null,
                    hasMixOrStems: Boolean(mix?.tracks.length),
                    legoSidecarReady,
                    legoLicenseAccepted,
                  });
                  if (!plan.ok) {
                    setInstrumentalNotice(plan.messageFr);
                    return;
                  }
                  void onRequestInstrumentalPart({
                    role: instrumentalRole,
                    conditioning: instrumentalCond,
                  }).catch((e) =>
                    setInstrumentalNotice(
                      e instanceof Error ? e.message : String(e),
                    ),
                  );
                }}
              >
                {t("production.instrumental.generate")}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setInstrumentalOpen(false)}
              >
                {t("production.instrumental.cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="production-mix-region"
        role="region"
        aria-label={t("production.common.mix")}
      >
        {mix ? (
          <div
            className="mixer mixer-density production-mix-panel"
            data-density={effectiveDensity}
            data-density-preference={densityPreference}
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
                className="mix-master-banner production-mix-master"
                aria-label={t("mix.masterBanner")}
              >
                <div className="mix-master-transport-controls">
                  <button
                    type="button"
                    className="btn mix-master-play"
                    disabled={!playback?.ready || playback.loading}
                    aria-label={
                      playback?.loading
                        ? t("player.loading")
                        : playback?.playing
                          ? t("player.pause")
                          : t("player.play")
                    }
                    aria-keyshortcuts="Space"
                    onClick={() =>
                      void playback?.toggle().catch((e) => setError(String(e)))
                    }
                  >
                    {playback?.loading ? (
                      <span className="mix-master-play-loading" aria-hidden>
                        …
                      </span>
                    ) : playback?.playing ? (
                      <svg
                        className="mix-master-play-icon"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        aria-hidden
                        focusable="false"
                      >
                        <path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z" />
                      </svg>
                    ) : (
                      <svg
                        className="mix-master-play-icon"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        aria-hidden
                        focusable="false"
                      >
                        <path fill="currentColor" d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <div
                    className="mix-master-times"
                    aria-label={t("player.seek")}
                  >
                    <span className="player-time">
                      <PlaybackTime
                        seconds={playback?.current ?? 0}
                        className="player-time"
                      />
                    </span>
                    <span className="player-time-sep">/</span>
                    <span className="player-time">
                      {formatPlaybackTime(playback?.duration ?? 0)}
                    </span>
                  </div>
                </div>
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
                <div className="mix-master-level">
                  <MixSlider
                    className="mix-master-fader"
                    value={mix.masterGainDb}
                    min={-24}
                    max={12}
                    step={0.5}
                    defaultValue={0}
                    ariaLabel={t("production.settings.master")}
                    valueText={formatGainDb(mix.masterGainDb)}
                    displayValue={formatGainDb(mix.masterGainDb)}
                    parseDisplay={parseGainDb}
                    onChange={(gainDb) =>
                      scheduleMixUpdate(
                        { ...mix, masterGainDb: gainDb },
                        { persist: false },
                      )
                    }
                    onCommit={(gainDb) =>
                      scheduleMixUpdate({ ...mix, masterGainDb: gainDb })
                    }
                  />
                  <div
                    className="mix-master-meter"
                    role="meter"
                    aria-label={t("mix.masterMeter")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={mixPeakPercent(
                      mixPeakAtPlayhead(
                        playback?.mixPeaks ?? null,
                        playback?.current ?? 0,
                        playback?.duration ?? 0,
                      ),
                    )}
                  >
                    <span
                      className="mix-master-meter-fill"
                      style={{
                        height: `${mixPeakPercent(
                          mixPeakAtPlayhead(
                            playback?.mixPeaks ?? null,
                            playback?.current ?? 0,
                            playback?.duration ?? 0,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div
                  className="production-density-seg mix-master-density"
                  role="group"
                  aria-label={t("mix.density.group")}
                >
                  {(["auto", "compact", "confortable"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="production-density-btn"
                      aria-pressed={densityPreference === mode}
                      onClick={() => setDensityPreferencePersist(mode)}
                    >
                      <span className="production-density-check" aria-hidden>
                        ✓
                      </span>
                      {t(`mix.density.${mode}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={[
                  "production-context-bar",
                  mixLayoutNarrow ? "production-context-bar-narrow" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {separationInfo && separationInfo.warnings.length > 0 && (
                  <EstimatedSeparationMarker warningCodes={separationInfo.warnings} />
                )}
                <p className="mix-autosave production-mix-saved" role="status">
                  {mixSavedAt
                    ? t("mix.savedAt", { time: formatSavedClock(mixSavedAt) })
                    : "\u00a0"}
                </p>
              </div>
            </div>

            <div className="production-mix-scroll" ref={mixScrollRef}>
              {!tightMixLayout && (
                <div
                  className="production-mix-colheaders production-mix-grid"
                  aria-hidden="true"
                >
                  <span>{t("mix.columns.track")}</span>
                  <span>{t("mix.columns.gain")}</span>
                  <span>{t("mix.columns.pan")}</span>
                  <span>{t("mix.columns.ms")}</span>
                  <span>{t("mix.columns.tools")}</span>
                  <span>{t("mix.columns.waveform")}</span>
                </div>
              )}

              <div className="production-mix-list" role="list" aria-label={t("mix.tracksTitle")}>
                <div role="region" aria-label={t("production.common.clips")} className="production-common-timeline">
                <ClipTimeline
                  mix={mix} onChange={scheduleMixUpdate}
                  peaksByTrack={playback?.peaksByTrack} roleByTrack={roleByTrack}
                  sourceDurationMsByTrack={sourceDurationMsByTrack}
                  projectTempoBpm={project.tempoBpm} projectMeter={project.meter ?? null}
                  currentTimeMs={(playback?.current ?? 0)*1000} onSeek={playback?.seek}
                  clipViewPrefs={clipViewPrefs} onClipViewPrefsChange={patchClipViewPrefs}
                  hideChrome
                  hideHeaderTools
                  editTool={editTool}
                  onEditToolChange={setEditTool}
                  renderTracks={(renderLane,timelineMs)=>{
                  const anySolo = mix.tracks.some((x) => x.solo);
                  const renderTrack = (tr: MixTrack, inGroup: boolean) => {
                    const muted = tr.mute || (anySolo && !tr.solo);
                    const implicit = anySolo && !tr.solo && !tr.mute;
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
                      <Fragment key={tr.id}>
                      <div
                        className={rowClass}
                        data-role={tr.role.toLowerCase()}
                        data-track-id={tr.id}
                        role="listitem"
                      >
                        <div className="production-mix-name">
                          <span className="production-mix-strip" aria-hidden />
                          <TruncatedTrackLabel
                            className="production-mix-track-label"
                            fullTitle={tr.name}
                          >
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
                          </TruncatedTrackLabel>
                          {tr.role === "midi" && onEditMidiTrack && (
                            <button
                              type="button"
                              className="btn studio-midi-edit-track"
                              onClick={() => onEditMidiTrack(tr.id, tr.name)}
                              aria-label={`${t("production.midi.openPianoRoll")} — ${tr.name}`}
                              title={t("production.midi.openPianoRoll")}
                            >
                              <span aria-hidden="true">♬</span>
                            </button>
                          )}
                        </div>
                        <MixSlider
                          className="track-gain-knob track-gain-slider"
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
                        <MixSlider
                          className="track-pan-knob track-pan-slider"
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
                            title={t("mix.muteNamed", { track: tr.name })}
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
                            title={t("mix.soloNamed", { track: tr.name })}
                            onClick={() =>
                              scheduleMixUpdate(patchTrack(mix, tr.id, { solo: !tr.solo }))
                            }
                          >
                            <span className="track-ms-glyph" aria-hidden>
                              {t("mix.solo")}
                            </span>
                          </button>
                        </div>
                        <div className="production-mix-track-tools">
                          <ProductionTrackTools
                            track={tr}
                            mix={mix}
                            scheduleMixUpdate={scheduleMixUpdate}
                            isOpen={openTrackToolsId === tr.id}
                            onOpenChange={(open) => {
                              if (open) setOpenTrackToolsId(tr.id);
                              else if (openTrackToolsId === tr.id) {
                                setOpenTrackToolsId(null);
                              }
                            }}
                            tempoBpm={form.tempoBpm}
                            onTranscribeBasicPitch={
                              onTranscribeBasicPitch
                                ? () => onTranscribeBasicPitch(tr)
                                : undefined
                            }
                            transcribing={transcribingTrackId === tr.id}
                          />
                        </div>
                        <div className="track-wave production-mix-wave">
                          {renderLane(tr)}
                        </div>
                      </div>
                      <ProductionTrackAutomation
                        mixId={mix.id} trackId={tr.id} trackName={tr.name}
                        durationMs={timelineMs}
                        currentMs={(playback?.current ?? 0) * 1000}
                        locked={tr.locked}
                        nudgeMs={!clipViewPrefs.snapEnabled || clipViewPrefs.gridMode==="time"?50:Math.max(1,Math.round(60000/(mix.tempoMap?.[0]?.quarterBpm??form.tempoBpm??120)/clipViewPrefs.subdivision))}
                        onCollapse={()=>requestAnimationFrame(()=>{
                          const row=Array.from(document.querySelectorAll<HTMLElement>(".production-mix-row")).find(el=>el.dataset.trackId===tr.id);
                          row?.querySelector<HTMLButtonElement>(".production-track-tools-btn")?.focus();
                        })}
                      />
                      </Fragment>
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
                    const measureOffscreen =
                      capturePaintCollapsedTracks && collapsed && group.family === "rythmique";
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
                                {formatMixGroupTrackCount(group.tracks.length)}
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
                                  ? "btn track-ms-btn track-ms-btn-m track-ms-btn-group pressed"
                                  : "btn track-ms-btn track-ms-btn-m track-ms-btn-group"
                              }
                              aria-pressed={gMute}
                              aria-label={t("mix.group.muteNamed", { group: groupName })}
                              title={t("mix.group.muteNamed", { group: groupName })}
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
                                  ? "btn track-ms-btn track-ms-btn-s track-ms-btn-group pressed"
                                  : "btn track-ms-btn track-ms-btn-s track-ms-btn-group"
                              }
                              aria-pressed={gSolo}
                              aria-label={t("mix.group.soloNamed", { group: groupName })}
                              title={t("mix.group.soloNamed", { group: groupName })}
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
                              {formatMixGroupCollapsedSummary(
                                group.tracks.length,
                                collapsedNames,
                              )}
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
                          className={
                            measureOffscreen
                              ? "production-mix-group-tracks production-mix-group-tracks--measure-offscreen"
                              : "production-mix-group-tracks"
                          }
                          role="list"
                          aria-label={groupName}
                          hidden={collapsed && !measureOffscreen}
                          aria-hidden={measureOffscreen ? true : undefined}
                        >
                          {group.tracks.map((tr) => renderTrack(tr, true))}
                        </div>
                      </div>
                    );
                  });
                  }} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="hint">{t("mix.needSeparation")}</p>
        )}
      </div>

      {mix && (
        <>
          <ProductionMixSettingsPopin
            open={mixSettingsOpen}
            onClose={() => setMixSettingsOpen(false)}
            anchorRef={mixSettingsAnchorRef}
            panelId={mixSettingsPanelId}
            labelId={mixSettingsLabelId}
            deferEscapeClose={mixSettingsDeferEscape}
            preferAboveAnchor={false}
            clipView={clipViewPrefs}
            onClipViewChange={patchClipViewPrefs}
            densityPreference={densityPreference}
            effectiveDensityLabelKey={
              effectiveDensity === "compact"
                ? "mix.density.compact"
                : "mix.density.confortable"
            }
            onDensityPreference={setDensityPreferencePersist}
            mix={mix}
            onMixChange={scheduleMixUpdate}
            sources={playbackSources}
            tempoBpm={form.tempoBpm}
            onMasterGainChange={(gainDb, persist) =>
              scheduleMixUpdate(
                { ...mix, masterGainDb: gainDb },
                persist ? undefined : { persist: false },
              )
            }
            hasAiStems={hasAiStems}
            separateDisabled={separateDisabled}
            separateDisabledReason={separateDisabledReason}
            onSeparateClick={(el) => openSeparateFrom(el)}
            showMixAssist={showMixAssist || showProductionCopilot}
            showProductionCopilot={false}
            onOpenMixAssist={(el) => openMixAssistFrom(el)}
            onOpenCopilot={(el) => openMixAssistFrom(el)}
          />
          <AnchoredPopin
            open={mixAssistOpen}
            onClose={() => setMixAssistOpen(false)}
            anchorRef={mixAssistBtnRef}
            labelId={mixAssistTitleId}
            className="mix-assist-popin"
            preferAboveAnchor
          >
            <header className="anchored-popin-header">
              <h3 id={mixAssistTitleId}>{t("qwen.mix.title")}</h3>
              <PopinCloseButton
                label={t("qwen.mix.close")}
                onClick={() => setMixAssistOpen(false)}
              />
            </header>
            <QwenMixAssistant
              mix={mix}
              sources={playbackSources}
              onCommitMix={(next) => scheduleMixUpdate(next)}
            />
            <details className="mix-assistant-manual">
              <summary>{t("qwen.mix.manual")}</summary>
            <MixAssistPanel
              mix={mix}
              sources={playbackSources}
              listeningMix={listeningMix ?? mix}
              onCommitMix={(next) => scheduleMixUpdate(next)}
              onPreviewMix={setMixPreview}
            />
            <ProductionAssistPanel
              mix={mix}
              sources={playbackSources}
              scoreIssues={scoreGate.issues}
              listeningMix={listeningMix ?? mix}
              onCommitMix={(next) => scheduleMixUpdate(next)}
              onPreviewMix={setMixPreview}
            />
            </details>
          </AnchoredPopin>
        </>
      )}
      <SeparationRecommendDialog
        open={separateOpen}
        onClose={() => setSeparateOpen(false)}
        anchorRef={separateAnchorRef}
        audioDurationSec={separationAudioSec}
        busy={busy}
        onConfirm={() => {
          setSeparateOpen(false);
          void onSeparate();
        }}
      />
      <p className="production-edit-footer hint" role="status">
        {t(`production.edit.${editTool}.hint`)}
      </p>
    </section>
  );
}
