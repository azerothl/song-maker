import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { InvariantPanel } from "../components/InvariantPanel";
import { RegenerationGate } from "../components/RegenerationGate";
import { RemoteGenerateConfirm } from "../components/RemoteGenerateConfirm";
import { SeparationRecommendDialog } from "../components/SeparationRecommendDialog";
import { UpdateNotice } from "../components/UpdateNotice";
import type { Update } from "@tauri-apps/plugin-updater";
import { useAppStore } from "../store/appStore";
import {
  captureInvariantScoreDocument,
  captureRegenerationAfterViolations,
  captureRegenerationBefore,
  captureRemotePayloadPreview,
  captureRemotePrefs,
  CONFIRM_CAPTURE_PROJECT_ID,
  parseConfirmCaptureHash,
  prepareRegenerationBaseline,
} from "./confirmDialogsCaptureFixtures";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { registerCaptureProject } from "./tauriInvokeMock";
import "../App.css";

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  registerCaptureProject(seededProject);
}
useAppStore.setState({
  screen: "song",
  settings: useAppStore.getState().settings ?? {
    projectsDir: "/tmp/capture-projects",
    cacheDir: "/tmp/capture-cache",
    binaryTag: "capture",
    binaryArchive: "capture.zip",
    binarySha256: "",
    modelPack: "q4",
    modelGguf: "capture.gguf",
    modelSha256: "",
    serverHost: "127.0.0.1",
    serverPort: 8080,
    stemSeparator: "htdemucs",
    ccByNcAccepted: true,
    yue2LicenseAccepted: true,
    acceptedSeparatorLicenses: { htdemucs: true },
    localYue2Enabled: true,
  },
});

function useCaptureScenario() {
  const [scenario, setScenario] = useState(() =>
    parseConfirmCaptureHash(globalThis.location?.hash ?? ""),
  );
  useEffect(() => {
    const sync = () => setScenario(parseConfirmCaptureHash(globalThis.location?.hash ?? ""));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return scenario;
}

function MockUpdateNotice() {
  const update = useMemo(
    (): Update =>
      ({
        version: "0.2.0-capture",
        body: "Correctifs accessibilité et stabilité (capture harness #186).",
        downloadAndInstall: async () => {},
        close: async () => {},
      }) as Update,
    [],
  );
  return <UpdateNotice update={update} onDismiss={() => {}} />;
}

function MockSeparationRecommend() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="panel" style={{ padding: "1.5rem" }}>
      <p className="hint">
        Harness capture — dialogue de recommandation séparation (mock Tauri{" "}
        <code>get_phase3_status</code>).
      </p>
      <button ref={anchorRef} type="button" className="btn" id="sep-anchor">
        Séparer les pistes…
      </button>
      <SeparationRecommendDialog
        open
        anchorRef={anchorRef}
        audioDurationSec={180}
        busy={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </div>
  );
}

function MockRegenerationGate() {
  const before = useMemo(() => captureRegenerationBefore(), []);
  const after = useMemo(() => captureRegenerationAfterViolations(), []);
  useEffect(() => {
    prepareRegenerationBaseline(before);
  }, [before]);
  const hash = globalThis.location?.hash ?? "";
  const violations = hash.toLowerCase().includes("violations");
  return (
    <RegenerationGate
      open
      projectId={CONFIRM_CAPTURE_PROJECT_ID}
      beforeDocument={before}
      afterDocument={violations ? after : null}
      isRegeneration
      onProceed={() => {}}
      onCancel={() => {}}
      onConfirmKeep={() => {}}
      onRevert={() => {}}
    />
  );
}

function ConfirmDialogsCaptureApp() {
  const scenario = useCaptureScenario();
  const invariantDoc = useMemo(() => captureInvariantScoreDocument(), []);

  return (
    <div
      className="app-shell confirm-dialogs-capture-root"
      data-capture-scenario={scenario}
      data-capture-mock="confirm-dialogs-harness"
    >
      <main className="main">
        {scenario === "regeneration-gate" && <MockRegenerationGate />}
        {scenario === "invariant-panel" && (
          <div className="panel wide" style={{ padding: "1.5rem" }}>
            <p className="hint">
              Harness — baseline invariants pré-capturée en mémoire pour activer le bouton
              « Vérifier ».
            </p>
            <InvariantPanel document={invariantDoc} projectId={CONFIRM_CAPTURE_PROJECT_ID} />
          </div>
        )}
        {scenario === "remote-generate-confirm" && (
          <RemoteGenerateConfirm
            open
            prefs={captureRemotePrefs}
            payloadPreview={captureRemotePayloadPreview()}
            onCancel={() => {}}
            onConfirm={() => {}}
          />
        )}
        {scenario === "separation-recommend" && <MockSeparationRecommend />}
        {scenario === "update-notice" && (
          <div className="panel" style={{ padding: "1rem" }}>
            <p className="hint">
              Harness — objet <code>Update</code> mocké (sans{" "}
              <code>plugin-updater</code> Tauri).
            </p>
            <MockUpdateNotice />
          </div>
        )}
      </main>
    </div>
  );
}

attachPrimaryButtonMetricsWindow();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ConfirmDialogsCaptureApp />
    </React.StrictMode>,
  );
}

declare global {
  interface Window {
    __confirmCaptureScenario?: () => string;
  }
}

window.__confirmCaptureScenario = () =>
  document.querySelector("[data-capture-scenario]")?.getAttribute("data-capture-scenario") ??
  "";
