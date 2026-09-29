import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ProductionWorkspace } from "../screens/song/ProductionWorkspace";
import type { PlaybackView } from "../components/AudioPlayer";
import { t } from "../ui/i18n";
import { workspaceLabel, WORKSPACES, type ProductionView } from "../screens/song/shared";
import {
  buildCaptureDemoMix,
  buildCapturePlaybackSources,
  buildCaptureProject,
  buildCaptureSeparationInfo,
  syntheticPeaks,
} from "./captureDemoMix";
import {
  loadCollapsedTrackFamilies,
  saveCollapsedTrackFamily,
  saveProductionDensityPreference,
} from "../lib/productionTrackLayout";
import type { MixDoc } from "../lib/types";
import { measureProductionMix } from "./productionCaptureMetrics";
import { measureProductionTransport } from "./productionTransportMetrics";
import { measureProductionStemColors } from "./stemCaptureMetrics";
import { measureMasterWavePlayheadContrast } from "./waveformPlayheadContrast";
import { parseCaptureHash } from "./productionCaptureHash";
import "../App.css";

function applyCaptureHashPrefs() {
  const prefs = parseCaptureHash(globalThis.location?.hash ?? "");
  saveProductionDensityPreference(prefs.densityPreference);
  if (prefs.rythmiqueCollapsed) {
    saveCollapsedTrackFamily("rythmique", true);
  } else {
    saveCollapsedTrackFamily("rythmique", false);
  }
  return prefs;
}

function useCaptureHashPrefs() {
  const [prefs, setPrefs] = useState(() => applyCaptureHashPrefs());
  useEffect(() => {
    const sync = () => setPrefs(applyCaptureHashPrefs());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return prefs;
}

function CaptureSidebar() {
  return (
    <aside className="sidebar" aria-label={t("nav.sidebar")}>
      <div className="sidebar-top">
        <div className="brand">{t("app.name")}</div>
      </div>
      <nav aria-label={t("nav.main")}>
        <button type="button" className="active" aria-current="page">
          <span className="sidebar-label">{t("nav.library")}</span>
        </button>
        <button type="button">
          <span className="sidebar-label">{t("nav.new")}</span>
        </button>
        <button type="button">
          <span className="sidebar-label">{t("nav.settings")}</span>
        </button>
      </nav>
    </aside>
  );
}

function ProductionCaptureApp() {
  const capturePrefs = useCaptureHashPrefs();
  const mix = useMemo(
    () => buildCaptureDemoMix(capturePrefs.trackCount),
    [capturePrefs.trackCount],
  );
  const project = useMemo(() => buildCaptureProject(), []);
  const playbackSources = useMemo(() => buildCapturePlaybackSources(mix), [mix]);
  const separationInfo = useMemo(() => buildCaptureSeparationInfo(), []);
  const [productionView, setProductionView] = useState<ProductionView>("mix");
  const [mixState, setMixState] = useState<MixDoc>(mix);
  const [mixSavedAt] = useState(() => new Date());
  const [captureBusy, setCaptureBusy] = useState(false);
  const playbackDuration = 444;

  const playback = useMemo((): PlaybackView => {
    const peaksByTrack: Record<string, Float32Array> = {};
    let seed = 1;
    for (const tr of mix.tracks) {
      peaksByTrack[tr.id] = syntheticPeaks(seed++);
    }
    return {
      current: playbackDuration * capturePrefs.progressRatio,
      duration: playbackDuration,
      mode: "stems",
      peaksByTrack,
      mixPeaks: syntheticPeaks(99, 200),
      seek: () => {},
      toggle: async () => {},
      playing: capturePrefs.midPlayback,
      loading: false,
      ready: true,
    };
  }, [mix, capturePrefs.midPlayback, capturePrefs.progressRatio]);

  useEffect(() => {
    window.__productionCaptureSetBusy = (busy: boolean) => {
      setCaptureBusy(busy);
    };
    return () => {
      delete window.__productionCaptureSetBusy;
    };
  }, []);

  return (
    <div className="app-shell production-capture-root" data-capture-tracks={capturePrefs.trackCount}>
      <CaptureSidebar />
      <main className="main">
        <div className="song-layout song-layout-production song-layout-production-fill">
          <header className="song-workspace-chrome">
            <div className="song-workspace-chrome-top">
              <div className="song-workspace-project">
                <h1>{project.title}</h1>
              </div>
              <nav
                className="song-workspace-tabs"
                role="tablist"
                aria-label={t("workspace.nav")}
              >
                {WORKSPACES.map((space) => (
                  <button
                    key={space}
                    type="button"
                    role="tab"
                    className="song-workspace-tab"
                    aria-selected={space === "production"}
                    tabIndex={space === "production" ? 0 : -1}
                  >
                    {workspaceLabel(space)}
                  </button>
                ))}
              </nav>
            </div>
            <div className="song-workspace-transport">
              <div className="player-block player-block-delegated" aria-hidden />
            </div>
          </header>
          <div className="song-workspace-body">
            <ProductionWorkspace
              busy={captureBusy}
              form={{
                title: project.title,
                style: project.style,
                lyrics: project.lyrics,
                cot: project.cot,
                targetDurationSec: project.targetDurationSec ?? 180,
                preferFullLyrics: true,
                instrumentalMode: false,
              }}
              importingAudio={false}
              listeningMix={mixState}
              mix={mixState}
              mixSavedAt={mixSavedAt}
              onExport={async () => {}}
              onImportUserAudio={async () => {}}
              onSeparate={async () => {}}
              onUserTrackAdded={async () => {}}
              playback={playback}
              playbackSources={playbackSources}
              productionView={productionView}
              project={project}
              recordOpen={false}
              roleByTrack={Object.fromEntries(mix.tracks.map((tr) => [tr.id, tr.role]))}
              scheduleMixUpdate={(next) => {
                if (next) setMixState(next);
              }}
              scoreGate={{ abc: null, error: null, issues: [] }}
              separationInfo={separationInfo}
              setBusy={() => {}}
              setError={() => {}}
              setMixPreview={() => {}}
              setProductionView={setProductionView}
              setRecordOpen={() => {}}
              showMixAssist
              showProductionCopilot
              sourceDurationMsByTrack={{}}
              capturePaintCollapsedTracks={capturePrefs.rythmiqueCollapsed}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ProductionCaptureApp />
    </React.StrictMode>,
  );
}

declare global {
  interface Window {
    __productionCaptureSetBusy?: (busy: boolean) => void;
    __productionCaptureMetrics?: () => ReturnType<typeof measureProductionMix>;
    __productionTransportMetrics?: () => ReturnType<typeof measureProductionTransport>;
    __productionPlayheadContrast?: () => ReturnType<
      typeof measureMasterWavePlayheadContrast
    >;
    __productionStemColors?: () => ReturnType<typeof measureProductionStemColors>;
  }
}

window.__productionCaptureMetrics = () => measureProductionMix();
window.__productionTransportMetrics = () => measureProductionTransport();
window.__productionPlayheadContrast = () => measureMasterWavePlayheadContrast();
window.__productionStemColors = () => measureProductionStemColors();

void loadCollapsedTrackFamilies();
