import React from "react";
import ReactDOM from "react-dom/client";
import { Sidebar } from "../App";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import { measureSidebarCapture } from "./sidebarCaptureMetrics";
import "../App.css";

export function applySidebarCapturePrefs(hashRaw: string): void {
  const hash = hashRaw.replace(/^#/, "").toLowerCase();
  if (hash.includes("collapsed")) {
    writeSidebarCollapsedPref(true);
  } else {
    writeSidebarCollapsedPref(false);
  }
}

applySidebarCapturePrefs(globalThis.location?.hash ?? "");

useAppStore.setState({
  screen: "library",
  error: null,
  project: null,
  job: null,
});

function SidebarCaptureShell() {
  return (
    <div className="app-shell sidebar-capture-root">
      <Sidebar />
      <main className="main" aria-hidden="true">
        <div className="library-screen" style={{ padding: "2rem" }}>
          <h1>Bibliothèque</h1>
          <p className="hint">Harness capture barre latérale (#155)</p>
        </div>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <SidebarCaptureShell />
    </React.StrictMode>,
  );
}

declare global {
  interface Window {
    __sidebarCaptureMetrics?: () => ReturnType<typeof measureSidebarCapture>;
  }
}

window.__sidebarCaptureMetrics = () => measureSidebarCapture();
