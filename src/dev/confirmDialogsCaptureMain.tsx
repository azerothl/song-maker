import React, { useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { RegenerationGate } from "../components/RegenerationGate";
import {
  captureRegenerationBefore,
  CONFIRM_CAPTURE_PROJECT_ID,
  prepareRegenerationBaseline,
} from "./confirmDialogsCaptureFixtures";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import "../App.css";

function RegenerationGateCapture() {
  const before = useMemo(() => captureRegenerationBefore(), []);
  useEffect(() => {
    prepareRegenerationBaseline(before);
  }, [before]);

  return (
    <RegenerationGate
      open
      projectId={CONFIRM_CAPTURE_PROJECT_ID}
      beforeDocument={before}
      afterDocument={null}
      isRegeneration
      onProceed={() => {}}
      onCancel={() => {}}
      onConfirmKeep={() => {}}
      onRevert={() => {}}
    />
  );
}

attachPrimaryButtonMetricsWindow();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="app-shell" data-capture-scenario="regeneration-gate">
      <main className="main">
        <RegenerationGateCapture />
      </main>
    </div>
  </React.StrictMode>,
);
