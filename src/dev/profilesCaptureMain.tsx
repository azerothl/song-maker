import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { Sidebar } from "../App";
import { ProfileKindBadge } from "../components/ProfileKindBadge";
import { ProfileMigrationBanner } from "../components/ProfileMigrationBanner";
import { ProfileOnboardingScreen } from "../screens/ProfileOnboardingScreen";
import { ProfileSwitchConfirmDialog } from "../components/ProfileSwitchConfirmDialog";
import { ProfileRenameDialog } from "../components/ProfileRenameDialog";
import { ProfileCommercialCreateConfirmDialog } from "../components/ProfileCommercialCreateConfirmDialog";
import { CommercialEnginesPanel } from "../components/CommercialEnginesPanel";
import { buildCommercialProfileCreationConfirm } from "@song-maker/stem-providers";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import {
  seedOnboardingCaptureStore,
  seedProfilesCaptureStore,
} from "./seedProfilesCaptureStore";
import "../App.css";
import "../screens/ProfileOnboardingScreen.css";

export type ProfileCaptureScene =
  | "onboarding"
  | "onboarding-commercial-disabled"
  | "onboarding-six-max"
  | "selector-closed"
  | "selector-open"
  | "selector-collapsed"
  | "switch-confirm"
  | "switch-blocked-generation"
  | "commercial-engines-fixture"
  | "migration-banner"
  | "rename"
  | "commercial-create";

function parseScene(hash: string): ProfileCaptureScene {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h.includes("six-max")) return "onboarding-six-max";
  if (h.includes("commercial-disabled")) return "onboarding-commercial-disabled";
  if (h.includes("commercial-create") || h.includes("create-confirm")) {
    return "commercial-create";
  }
  if (h.includes("rename")) return "rename";
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

if (
  scene === "onboarding" ||
  scene === "onboarding-commercial-disabled" ||
  scene === "onboarding-six-max"
) {
  seedOnboardingCaptureStore(undefined, scene === "onboarding-six-max");
} else {
  seedProfilesCaptureStore(
    scene === "migration-banner" ? { migrationBannerVisible: true } : undefined,
  );
}

function CaptureErrorBanner() {
  const error = useAppStore((s) => s.error);
  if (!error) return null;
  return (
    <div
      className="banner error"
      role="alert"
      aria-live="assertive"
      data-testid="capture-app-error"
    >
      <span>{error}</span>
    </div>
  );
}

function CaptureShell() {
  useEffect(() => {
    if (scene === "switch-blocked-generation") {
      useAppStore.setState({
        job: { state: "generating", label: "Génération en cours · étape 2/4" },
      });
    }
    if (scene === "selector-open") {
      setTimeout(() => {
        document
          .querySelector<HTMLButtonElement>(
            '[data-testid="profile-selector-trigger"]',
          )
          ?.click();
      }, 200);
    }
    if (scene === "selector-collapsed") {
      setTimeout(() => {
        const trigger = document.querySelector<HTMLButtonElement>(
          '[data-testid="profile-selector-trigger"]',
        );
        trigger?.focus();
      }, 250);
    }
  }, []);

  if (
    scene === "onboarding" ||
    scene === "onboarding-commercial-disabled" ||
    scene === "onboarding-six-max"
  ) {
    return (
      <div className="app-shell profiles-capture-root">
        <main className="main">
          <CaptureErrorBanner />
          <ProfileOnboardingScreen />
        </main>
      </div>
    );
  }

  if (scene === "commercial-engines-fixture") {
    return (
      <div className="app-shell profiles-capture-root">
        <main className="main panel settings">
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
          target={profiles[1]}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  if (scene === "rename") {
    const profiles = useAppStore.getState().profilesState!.profiles;
    return (
      <div className="app-shell profiles-capture-root">
        <ProfileRenameDialog
          open
          currentName={profiles[0]?.name ?? "Profil"}
          typeLabel="Hobby"
          existingNames={profiles.slice(1).map((p) => p.name)}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  if (scene === "commercial-create") {
    const confirm = buildCommercialProfileCreationConfirm() ?? {
      titleFr: "Créer un profil Commercial ?",
      titleEn: "Create a Commercial profile?",
      introFr: "Harness capture — confirmation commerciale.",
      introEn: "Capture harness.",
      engineLinesFr: ["Moteur proposé aujourd'hui : Capture — réservé."],
      engineLinesEn: ["Engine offered today: Capture — reserved."],
    };
    return (
      <div className="app-shell profiles-capture-root">
        <ProfileCommercialCreateConfirmDialog
          open
          confirm={confirm}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  if (scene === "migration-banner") {
    return (
      <div className="app-shell profiles-capture-root">
        <Sidebar />
        <main className="main panel library">
          <header className="panel-header">
            <h1 className="song-title-with-badge">
              Bibliothèque
              <ProfileKindBadge />
            </h1>
          </header>
          <ProfileMigrationBanner />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell profiles-capture-root">
      <Sidebar />
      <main className="main">
        <header className="song-header">
          <h1 className="song-title-with-badge">
            Nuit claire
            <ProfileKindBadge />
          </h1>
          {scene === "switch-blocked-generation" ? (
            <p className="profile-capture-jobline">
              Génération en cours · étape 2/4
            </p>
          ) : null}
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
