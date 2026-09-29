import React from "react";
import ReactDOM from "react-dom/client";
import { RegenerationGate } from "../components/RegenerationGate";
import "../App.css";

function RegenGateCaptureApp() {
  return (
    <RegenerationGate
      open
      projectId="capture-regen-gate"
      beforeDocument={null}
      isRegeneration
      onProceed={() => {}}
      onCancel={() => {}}
      onConfirmKeep={() => {}}
      onRevert={() => {}}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RegenGateCaptureApp />
  </React.StrictMode>,
);
