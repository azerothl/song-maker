import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { useAppStore } from "../store/appStore";
import type { AppSettings } from "../lib/types";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { registerCaptureProject } from "./tauriInvokeMock";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import "../App.css";

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
    <App />
  </React.StrictMode>,
);
