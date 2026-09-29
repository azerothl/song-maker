import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { useAppStore } from "../store/appStore";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { registerCaptureProject } from "./tauriInvokeMock";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import "../App.css";

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  registerCaptureProject(seededProject);
}

attachPrimaryButtonMetricsWindow();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
