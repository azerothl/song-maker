import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { Sidebar } from "../App";
import { ProfileOnboardingScreen } from "../screens/ProfileOnboardingScreen";
import { ProfileSwitchConfirmDialog } from "../components/ProfileSwitchConfirmDialog";
import { CommercialEnginesPanel } from "../components/CommercialEnginesPanel";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import { seedProfilesCaptureStore } from "./seedProfilesCaptureStore";
import "../App.css";
import "../screens/ProfileOnboardingScreen.css";

export type ProfileCaptureScene =
  | "onboarding"
  | "onboarding-commercial-disabled"
  | "selector-closed"
  | "selector-open"
  | "selector-collapsed"
  | "switch-confirm"
  | "switch-blocked-generation"
  | "commercial-engines-fixture"
  | "migration-banner";

function parseScene(hash: string): ProfileCaptureScene {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h.includes("commercial-disabled")) return "onboarding-commercial-disabled";
  if (h.includes("selector-open")) return "selector-open";
  if (h.includes("selector-collapsed")) return "selector-collapsed";
  if (h.includes("switch-confirm")) return "switch-confirm";
  if (h.includes("blocked-generation")) return "switch-blocked-generation";
  if (h.includes("engines")) return "commercial-engines-fixture";
  if (h.includes("migration")) return "migration-banner";
  if (h.includes("onboarding")) return "onboarding";
  return "selector-closed";
}

const scene = parseScene(globalThis.location?.hash ?? "");

if (scene.includes("collapsed")) {
  writeSidebarCollapsedPref(true);
} else {
  writeSidebarCollapsedPref(false);
}

seedProfilesCaptureStore(
  scene === "migration-banner" ? { migrationBannerVisible: true } : undefined,
);

function CaptureShell() {
  useEffect(() => {
    if (scene === "onboarding" || scene === "onboarding-commercial-disabled") {
      const prev = useAppStore.getState().profilesState;
      useAppStore.setState({
        screen: "profiles",
        profilesState: prev
          ? { ...prev, onboardingComplete: false }
          : prev,
      });
    }
    if (scene === "switch-blocked-generation") {
      useAppStore.setState({
        job: { state: "generating", label: "Génération en cours (étape 2/4)" },
      });
    }
    if (scene === "selector-open") {
      setTimeout(() => {
        document.querySelector<HTMLButtonElement>('[data-testid="profile-selector-trigger"]')?.click();
      }, 200);
    }
  }, []);

  if (scene === "onboarding" || scene === "onboarding-commercial-disabled") {
    return (
      <div className="app-shell profiles-capture-root">
        <main className="main">
          <ProfileOnboardingScreen />
        </main>
      </div>
    );
  }

  if (scene === "commercial-engines-fixture") {
    return (
      <div className="app-shell profiles-capture-root">
        <main className="main panel settings">
          <p className="hint">Fixture de test — aucun moteur branché en production.</p>
          <CommercialEnginesPanel />
        </main>
      </div>
    );
  }

  if (scene === "switch-confirm") {
    const profiles = useAppStore.getState().profilesState!.profiles;
    return (
      <div className="app-shell profiles-capture-root">
        <ProfileSwitchConfirmDialog
          open
          current={profiles[0]}
          target={profiles[2]}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="app-shell profiles-capture-root">
      <Sidebar />
      <main className="main">
        <header className="song-header">
          <h1>Nuit claire</h1>
        </header>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <CaptureShell />
    </React.StrictMode>,
  );
}
