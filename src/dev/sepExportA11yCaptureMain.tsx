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
  | "sep-unmeasured-badge"
  | "export-drawer-top-4"
  | "export-drawer-top-12"
  | "export-drawer-top-16"
  | "export-drawer-top-12-after"
  | "export-mix"
  | "export-mix-tight"
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
    "sep-unmeasured-badge",
    "export-drawer-top-4",
    "export-drawer-top-12",
    "export-drawer-top-16",
    "export-drawer-top-12-after",
    "export-mix",
    "export-mix-tight",
    "export-stems-none-selected",
    "regen-gate-blocked",
  ];
  return allowed.includes(h) ? h : "sep-header";
}

function drawerTrackCount(scene: CaptureScene): number {
  if (scene === "export-drawer-top-4") return 4;
  if (scene === "export-drawer-top-16") return 16;
  return 12;
}

function SepExportA11yCaptureApp() {
  const [scene, setScene] = useState<CaptureScene>(() =>
    parseScene(globalThis.location?.hash ?? ""),
  );
  const separateBtnRef = useRef<HTMLButtonElement>(null);
  const exportAnchorRef = useRef<HTMLButtonElement>(null);
  const [separateOpen, setSeparateOpen] = useState(false);
  const project = useMemo(() => buildCaptureProject(), []);
  const trackCount = drawerTrackCount(scene);
  const mixForDrawer = useMemo(
    () => buildCaptureDemoMix(trackCount),
    [trackCount],
  );
  const mix12 = useMemo(() => buildCaptureDemoMix(12), []);
  const sourcesDrawer = useMemo(
    () => buildCapturePlaybackSources(mixForDrawer),
    [mixForDrawer],
  );
  const sourcesMix = useMemo(
    () => buildCapturePlaybackSources(mix12),
    [mix12],
  );
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const drawerTopAnchor = scene.startsWith("export-drawer-top");
  const mixTight = scene === "export-mix-tight";
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
    if (scene !== "export-drawer-top-12-after") return;
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
      scene === "sep-unmeasured-badge" ||
      scene === "sep-exclusions" ||
      scene === "sep-revert" ||
      scene === "sep-run-blocked"
    ) {
      scroll.scrollTop = 0;
    } else if (scene === "sep-download") {
      const scroll = document.querySelector<HTMLElement>(
        ".separation-recommend-popin .anchored-popin-scroll",
      );
      const download = document.querySelector<HTMLElement>(
        '[data-testid^="sep-download-"]',
      );
      const reason = document.querySelector<HTMLElement>(
        '[data-testid^="sep-download-reason-"]',
      );
      download?.scrollIntoView({ block: "start" });
      if (scroll && reason) {
        const sr = scroll.getBoundingClientRect();
        const rr = reason.getBoundingClientRect();
        scroll.scrollTop += rr.top - sr.top - 72;
      }
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

  const shellClass = [
    "app-shell",
    "production-capture-root",
    mixTight ? "production-workspace-tight" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      data-capture-scene={scene}
      data-capture-anchor-top={drawerTopAnchor ? "1" : undefined}
    >
      <aside className="sidebar">
        <div className="brand">Song Maker</div>
      </aside>
      <main className="main capture-a11y-main">
        <h1>Production</h1>
        <p className="hint">Capture a11y #191 — {scene}</p>
        {drawerTopAnchor && (
          <div className="capture-drawer-top">
            <ExportDialog
              key={scene}
              project={project}
              mix={mixForDrawer}
              sources={sourcesDrawer}
              busy={false}
              onBusy={() => {}}
              onError={() => {}}
              initialMode="stems"
              triggerRef={exportAnchorRef}
            />
          </div>
        )}
        {!drawerTopAnchor && scene.startsWith("sep-") && (
          <>
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
            <SeparationRecommendDialog
              open={separateOpen}
              onClose={() => setSeparateOpen(false)}
              anchorRef={separateBtnRef}
              audioDurationSec={97.5}
              busy={false}
              onConfirm={() => setSeparateOpen(false)}
            />
          </>
        )}
        {!drawerTopAnchor && !scene.startsWith("sep-") && (
          <div
            className={
              mixTight
                ? "production-mix-toolbar-actions capture-mix-tight-bar"
                : "capture-toolbar-top"
            }
          >
            <ExportDialog
              key={scene}
              project={project}
              mix={mix12}
              sources={sourcesMix}
              busy={false}
              onBusy={() => {}}
              onError={() => {}}
              initialMode={
                scene === "export-stems-none-selected" ? "stems" : "mix"
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SepExportA11yCaptureApp />
  </React.StrictMode>,
);
