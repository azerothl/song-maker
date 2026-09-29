import React, { useMemo, useState } from "react";
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
  loadProductionTrackDensity,
  saveCollapsedTrackFamily,
  saveProductionTrackDensity,
  type ProductionTrackDensity,
} from "../lib/productionTrackLayout";
import type { MixDoc } from "../lib/types";
import "../App.css";

function applyCaptureHashPrefs() {
  const hash = (globalThis.location?.hash ?? "").replace(/^#/, "");
  if (hash.includes("confortable")) {
    saveProductionTrackDensity("confortable");
  } else {
    saveProductionTrackDensity("compact");
  }
  if (hash.includes("collapsed")) {
    saveCollapsedTrackFamily("rythmique", true);
  } else if (hash.includes("expanded")) {
    saveCollapsedTrackFamily("rythmique", false);
  }
}

applyCaptureHashPrefs();

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
  const mix = useMemo(() => buildCaptureDemoMix(), []);
  const project = useMemo(() => buildCaptureProject(), []);
  const playbackSources = useMemo(() => buildCapturePlaybackSources(mix), [mix]);
  const separationInfo = useMemo(() => buildCaptureSeparationInfo(), []);
  const [productionView, setProductionView] = useState<ProductionView>("mix");
  const [mixState, setMixState] = useState<MixDoc>(mix);
  const [mixSavedAt] = useState(() => new Date());

  const playback = useMemo((): PlaybackView => {
    const peaksByTrack: Record<string, Float32Array> = {};
    let seed = 1;
    for (const tr of mix.tracks) {
      peaksByTrack[tr.id] = syntheticPeaks(seed++);
    }
    return {
      current: 0,
      duration: 444,
      mode: "stems",
      peaksByTrack,
      mixPeaks: syntheticPeaks(99, 200),
      seek: () => {},
      toggle: async () => {},
      playing: false,
      loading: false,
      ready: true,
    };
  }, [mix]);

  const density: ProductionTrackDensity = loadProductionTrackDensity();

  return (
    <div className="app-shell production-capture-root" data-capture-density={density}>
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
              busy={false}
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

// Expose pour Playwright : recompte des lignes entièrement visibles.
declare global {
  interface Window {
    __productionCaptureMetrics?: () => {
      totalRows: number;
      visibleRows: number;
      fullyVisibleRows: number;
      rowHeightPx: number;
      density: string;
    };
  }
}

window.__productionCaptureMetrics = () => {
  const scroll = document.querySelector(".production-mix-scroll");
  const rows = Array.from(document.querySelectorAll(".production-mix-row")).filter(
    (r) => (r as HTMLElement).offsetParent !== null,
  );
  const scrollRect = scroll?.getBoundingClientRect();
  const fully =
    scrollRect == null
      ? []
      : rows.filter((r) => {
          const b = r.getBoundingClientRect();
          return b.top >= scrollRect.top - 1 && b.bottom <= scrollRect.bottom + 1;
        });
  const rowH = rows[0]?.getBoundingClientRect().height ?? 0;
  return {
    totalRows: rows.length,
    visibleRows: rows.length,
    fullyVisibleRows: fully.length,
    rowHeightPx: Math.round(rowH),
    density: document.querySelector(".mixer-density")?.getAttribute("data-density") ?? "",
  };
};

// Indique que les groupes repliés sont lus au premier rendu.
void loadCollapsedTrackFamilies();
