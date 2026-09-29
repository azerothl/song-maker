import React from "react";
import ReactDOM from "react-dom/client";
import { Phase3SettingsPanel } from "../components/Phase3SettingsPanel";
import { useAppStore } from "../store/appStore";
import type { AppSettings } from "../lib/types";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import { registerCaptureProject } from "./tauriInvokeMock";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import "../App.css";

/**
 * Harness Réglages — page LoRA avec bouton primaire visible (#186).
 * Monte Phase3SettingsPanel directement (évite App + plugin-updater).
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="app-shell" data-capture-scenario="reglages-lora">
      <main className="main">
        <div className="panel settings">
          <header className="settings-page-header">
            <h1>LoRA et styles</h1>
            <p className="hint">
              Harness capture — primaire « Télécharger » visible (CC BY-NC accepté).
            </p>
          </header>
          <Phase3SettingsPanel view="lora" />
        </div>
      </main>
    </div>
  </React.StrictMode>,
);
