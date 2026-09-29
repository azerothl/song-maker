import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { SeparationRecommendDialog } from "../components/SeparationRecommendDialog";
import { ExportDialog } from "../components/ExportDialog";
import { RegenerationGate } from "../components/RegenerationGate";
import { useAppStore } from "../store/appStore";
import {
  buildCaptureDemoMix,
  buildCapturePlaybackSources,
  buildCaptureProject,
} from "./captureDemoMix";
import { registerCaptureProject } from "./tauriInvokeMock";
import "../App.css";

export type CaptureScene =
  | "sep-header"
  | "sep-footer"
  | "sep-download"
  | "sep-exclusions"
  | "sep-revert"
  | "sep-run-blocked"
  | "export-drawer-12"
  | "export-drawer-12-after-export"
  | "export-mix"
  | "export-stems-none-selected"
  | "regen-gate-blocked";

function parseScene(hash: string): CaptureScene {
  const h = hash.replace(/^#/, "") as CaptureScene;
  const allowed: CaptureScene[] = [
    "sep-header",
    "sep-footer",
    "sep-download",
    "sep-exclusions",
    "sep-revert",
    "sep-run-blocked",
    "export-drawer-12",
    "export-drawer-12-after-export",
    "export-mix",
    "export-stems-none-selected",
    "regen-gate-blocked",
  ];
  return allowed.includes(h) ? h : "sep-header";
}

function SepExportA11yCaptureApp() {
  const [scene, setScene] = useState<CaptureScene>(() =>
    parseScene(globalThis.location?.hash ?? ""),
  );
  const separateBtnRef = useRef<HTMLButtonElement>(null);
  const [separateOpen, setSeparateOpen] = useState(false);
  const project = useMemo(() => buildCaptureProject(), []);
  const mix12 = useMemo(() => buildCaptureDemoMix(12), []);
  const sources = useMemo(() => buildCapturePlaybackSources(mix12), [mix12]);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const drawerLayout =
    scene.startsWith("export-drawer") ||
    scene === "export-mix" ||
    scene === "export-stems-none-selected";
  const regenOnly = scene === "regen-gate-blocked";

  useEffect(() => {
    registerCaptureProject(project);
    void refreshSettings();
  }, [project, refreshSettings]);

  useEffect(() => {
    const sync = () => setScene(parseScene(globalThis.location?.hash ?? ""));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (regenOnly) {
      setSeparateOpen(false);
      return;
    }
    if (scene.startsWith("sep-")) {
      setSeparateOpen(true);
      return;
    }
    setSeparateOpen(false);
  }, [scene, regenOnly]);

  useEffect(() => {
    if (regenOnly || scene.startsWith("sep-")) return;
    const timer = window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>("[data-capture-export-trigger]")
        ?.click();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [scene, regenOnly]);

  useEffect(() => {
    if (scene !== "export-drawer-12-after-export") return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="export-run"]')?.click();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [scene]);

  useEffect(() => {
    if (scene !== "export-stems-none-selected") return;
    const timer = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLInputElement>(
          ".export-stem-list input[type=checkbox]",
        )
        .forEach((cb) => {
          if (cb.checked) cb.click();
        });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [scene]);

  useEffect(() => {
    if (!separateOpen) return;
    const scroll = document.querySelector<HTMLElement>(
      ".separation-recommend-popin .anchored-popin-scroll",
    );
    if (!scroll) return;
    if (
      scene === "sep-header" ||
      scene === "sep-exclusions" ||
      scene === "sep-revert" ||
      scene === "sep-run-blocked"
    ) {
      scroll.scrollTop = 0;
    } else if (scene === "sep-download") {
      document
        .querySelector<HTMLElement>('[data-testid^="sep-download-"]')
        ?.scrollIntoView({ block: "center" });
    } else if (scene === "sep-footer") {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [scene, separateOpen]);

  useEffect(() => {
    if (!separateOpen) return;
    const timer = window.setTimeout(() => {
      if (scene === "sep-revert") {
        const radios = document.querySelectorAll<HTMLInputElement>(
          'input[name="sep-model"]',
        );
        if (radios.length > 1) radios[1]?.click();
      }
      if (scene === "sep-run-blocked") {
        document.querySelector<HTMLInputElement>("#sep-model-bs_roformer")?.click();
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [scene, separateOpen]);

  if (regenOnly) {
    return (
      <div className="app-shell production-capture-root" data-capture-scene={scene}>
        <main className="main capture-a11y-main">
          <h1>Régénération</h1>
          <p className="hint">Capture #191 — {scene}</p>
          <RegenerationGate
            open
            projectId={project.id}
            beforeDocument={null}
            isRegeneration
            onProceed={() => {}}
            onCancel={() => {}}
            onConfirmKeep={() => {}}
            onRevert={() => {}}
          />
        </main>
      </div>
    );
  }

  return (
    <div
      className="app-shell production-capture-root"
      data-capture-scene={scene}
      data-capture-drawer={drawerLayout ? "1" : undefined}
    >
      <aside className="sidebar">
        <div className="brand">Song Maker</div>
      </aside>
      <main className="main capture-a11y-main">
        <h1>Production</h1>
        <p className="hint">Capture a11y #187 — {scene}</p>
        {!drawerLayout && (
          <div className="btn-row">
            <button
              ref={separateBtnRef}
              type="button"
              className="btn primary"
              onClick={() => setSeparateOpen(true)}
            >
              Séparer les pistes
            </button>
          </div>
        )}
        <div
          className={
            drawerLayout ? "capture-drawer-bottom" : "capture-toolbar-top"
          }
        >
          {drawerLayout && (
            <button
              ref={separateBtnRef}
              type="button"
              className="btn"
              onClick={() => setSeparateOpen(true)}
            >
              Séparer
            </button>
          )}
          <ExportDialog
            project={project}
            mix={mix12}
            sources={sources}
            busy={false}
            onBusy={() => {}}
            onError={() => {}}
            initialMode={
              scene === "export-mix"
                ? "mix"
                : scene === "export-stems-none-selected" ||
                    scene.startsWith("export-drawer")
                  ? "stems"
                  : "mix"
            }
          />
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SepExportA11yCaptureApp />
  </React.StrictMode>,
);
