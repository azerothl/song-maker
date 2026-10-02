import React from "react";
import ReactDOM from "react-dom/client";
import { Phase3SettingsPanel } from "../components/Phase3SettingsPanel";
import { Phase4SettingsPanel } from "../components/Phase4SettingsPanel";
import { useAppStore } from "../store/appStore";
import type { AppSettings } from "../lib/types";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import { registerCaptureProject } from "./tauriInvokeMock";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import "../App.css";

/**
 * Harness Réglages — LoRA phase 3 ou phase 4 (#186).
 * Hash `#phase4` → Phase4SettingsPanel ; sinon Phase3.
 */
const captureSettings: AppSettings = {
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
  mixLlmProvider: "ollama",
  mixLlmBaseUrl: "http://127.0.0.1:11434",
  mixLlmModelId: "qwen3.5:2b",
  mixLlmAllowRemote: false,
};

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  registerCaptureProject(seededProject);
}

useAppStore.setState({
  screen: "settings",
  settings: captureSettings,
});

attachPrimaryButtonMetricsWindow();

const phase4 =
  (globalThis.location?.hash ?? "").toLowerCase().includes("phase4");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div
      className="app-shell"
      data-capture-scenario={phase4 ? "reglages-lora-phase4" : "reglages-lora"}
    >
      <main className="main">
        <div className="panel settings">
          <header className="settings-page-header">
            <h1>{phase4 ? "LoRA styles (phase 4)" : "LoRA et styles"}</h1>
            <p className="hint">
              Harness capture — primaire « Télécharger » visible (CC BY-NC
              accepté).
            </p>
          </header>
          {phase4 ? (
            <Phase4SettingsPanel view="lora" />
          ) : (
            <Phase3SettingsPanel view="lora" />
          )}
        </div>
      </main>
    </div>
  </React.StrictMode>,
);
