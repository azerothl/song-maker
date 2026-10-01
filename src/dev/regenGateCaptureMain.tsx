import React from "react";
import ReactDOM from "react-dom/client";
import { RegenerationGate } from "../components/RegenerationGate";
import "../App.css";

/** Primaire bloqué (`beforeDocument` absent) — état réel `aria-disabled`, pas `disabled`. */
function RegenGateCaptureApp() {
  return (
    <div className="app-shell regen-gate-capture-root" data-capture-mock="regen-gate-blocked">
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RegenGateCaptureApp />
  </React.StrictMode>,
);
