import React from "react";
import ReactDOM from "react-dom/client";
import { Phase3SettingsPanel } from "../components/Phase3SettingsPanel";
import {
  PHASE3_CAPTURE_SETTINGS,
  PHASE3_CAPTURE_STATUS,
  seedPhase3LicenseCaptureStore,
} from "./seedPhase3LicenseCaptureStore";
import "../App.css";

seedPhase3LicenseCaptureStore();

function Phase3LicenseCaptureShell() {
  return (
    <div className="app-shell" style={{ padding: "1.5rem", maxWidth: 960 }}>
      <Phase3SettingsPanel view="separation" />
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Phase3LicenseCaptureShell />
    </React.StrictMode>,
  );
}

declare global {
  interface Window {
    __phase3CaptureFixture?: {
      settings: typeof PHASE3_CAPTURE_SETTINGS;
      status: typeof PHASE3_CAPTURE_STATUS;
    };
  }
}

window.__phase3CaptureFixture = {
  settings: PHASE3_CAPTURE_SETTINGS,
  status: PHASE3_CAPTURE_STATUS,
};
