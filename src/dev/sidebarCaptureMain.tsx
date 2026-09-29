import React from "react";
import ReactDOM from "react-dom/client";
import { Sidebar } from "../App";
import { LibraryScreen } from "../screens/LibraryScreen";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import { measureSidebarCapture } from "./sidebarCaptureMetrics";
import { seedSidebarCaptureStore } from "./seedSidebarCaptureStore";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
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
seedSidebarCaptureStore();

function SidebarCaptureShell() {
  return (
    <div className="app-shell sidebar-capture-root">
      <Sidebar />
      <main className="main">
        <LibraryScreen />
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
    __sidebarCaptureScreen?: () => string;
  }
}

window.__sidebarCaptureMetrics = () => measureSidebarCapture();
window.__sidebarCaptureScreen = () => useAppStore.getState().screen;
attachPrimaryButtonMetricsWindow();
