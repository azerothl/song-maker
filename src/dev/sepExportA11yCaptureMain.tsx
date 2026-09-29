import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { SeparationRecommendDialog } from "../components/SeparationRecommendDialog";
import { ExportDialog } from "../components/ExportDialog";
import { useAppStore } from "../store/appStore";
import {
  buildCaptureDemoMix,
  buildCapturePlaybackSources,
  buildCaptureProject,
} from "./captureDemoMix";
import "../App.css";

type Scene = "separation" | "export-mix" | "export-stems";

function parseScene(hash: string): Scene {
  const h = hash.replace(/^#/, "");
  if (h === "export-stems") return "export-stems";
  if (h === "export-mix") return "export-mix";
  return "separation";
}

function SepExportA11yCaptureApp() {
  const [scene, setScene] = useState<Scene>(() =>
    parseScene(globalThis.location?.hash ?? ""),
  );
  const separateBtnRef = useRef<HTMLButtonElement>(null);
  const [separateOpen, setSeparateOpen] = useState(false);
  const project = useMemo(() => buildCaptureProject(), []);
  const mix = useMemo(() => buildCaptureDemoMix(4), []);
  const sources = useMemo(() => buildCapturePlaybackSources(mix), [mix]);
  const refreshSettings = useAppStore((s) => s.refreshSettings);

  useEffect(() => {
    const sync = () => setScene(parseScene(globalThis.location?.hash ?? ""));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (scene === "separation") {
      setSeparateOpen(true);
      return;
    }
    setSeparateOpen(false);
    const timer = window.setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '[data-capture-export] .btn.primary',
      );
      btn?.click();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [scene]);

  return (
    <div className="app-shell production-capture-root">
      <aside className="sidebar">
        <div className="brand">Song Maker</div>
      </aside>
      <main className="main" style={{ padding: "1.25rem" }}>
        <h1>Production</h1>
        <p className="hint">Capture a11y #187 — {scene}</p>
        <div className="btn-row">
          <button
            ref={separateBtnRef}
            type="button"
            className="btn primary"
            data-capture-separate
            onClick={() => setSeparateOpen(true)}
          >
            Séparer les pistes
          </button>
          <span data-capture-export>
            <ExportDialog
              project={project}
              mix={
                scene === "export-stems"
                  ? { ...mix, tracks: [] }
                  : mix
              }
              sources={sources}
              busy={false}
              onBusy={() => {}}
              onError={() => {}}
              initialMode={scene === "export-stems" ? "stems" : "mix"}
            />
          </span>
        </div>
        <SeparationRecommendDialog
          open={separateOpen}
          onClose={() => setSeparateOpen(false)}
          anchorRef={separateBtnRef}
          audioDurationSec={97.5}
          busy={false}
          onConfirm={() => setSeparateOpen(false)}
        />
      </main>
    </div>
  );
}

void useAppStore.getState().refreshSettings();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SepExportA11yCaptureApp />
  </React.StrictMode>,
);
