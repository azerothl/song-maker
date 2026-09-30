import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import {
  seedOnboardingCaptureStore,
  seedProfilesCaptureStore,
} from "./seedProfilesCaptureStore";
import { applySidebarCapturePrefs } from "./sidebarCaptureMain";
import "../App.css";

type ProfileAppCaptureScene =
  | "onboarding-commercial-disabled"
  | "onboarding-six-max"
  | "selector-closed"
  | "selector-open"
  | "selector-collapsed"
  | "switch-confirm"
  | "switch-blocked-generation"
  | "commercial-engines-fixture"
  | "migration-banner";

function parseScene(hash: string): ProfileAppCaptureScene {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h.includes("six-max")) return "onboarding-six-max";
  if (h.includes("commercial-disabled")) return "onboarding-commercial-disabled";
  if (h.includes("selector-open")) return "selector-open";
  if (h.includes("selector-collapsed")) return "selector-collapsed";
  if (h.includes("switch-confirm")) return "switch-confirm";
  if (h.includes("blocked-generation")) return "switch-blocked-generation";
  if (h.includes("engines")) return "commercial-engines-fixture";
  if (h.includes("migration")) return "migration-banner";
  return "selector-closed";
}

const scene = parseScene(globalThis.location?.hash ?? "");
applySidebarCapturePrefs(globalThis.location?.hash ?? "");

if (
  scene === "onboarding-commercial-disabled" ||
  scene === "onboarding-six-max"
) {
  seedOnboardingCaptureStore(undefined, scene === "onboarding-six-max");
} else if (scene === "commercial-engines-fixture") {
  seedProfilesCaptureStore({
    profiles: [
      {
        id: "profile-001",
        name: "Studio",
        kind: "commercial",
        projectCount: 0,
        acceptedContractCount: 0,
        isLastUsed: true,
        isActive: true,
      },
      {
        id: "profile-002",
        name: "Reprises",
        kind: "hobby",
        projectCount: 4,
        acceptedContractCount: 1,
        isLastUsed: false,
        isActive: false,
      },
    ],
    activeProfileId: "profile-001",
    lastUsedProfileId: "profile-001",
    onboardingComplete: true,
  });
  useAppStore.setState({ screen: "settings", project: null });
} else if (scene === "migration-banner") {
  seedProfilesCaptureStore({ migrationBannerVisible: true });
} else {
  seedProfilesCaptureStore();
}

if (scene === "switch-blocked-generation") {
  useAppStore.setState({
    job: { state: "generating", label: "Génération en cours · étape 2/4" },
  });
}

if (scene === "selector-collapsed") {
  writeSidebarCollapsedPref(true);
} else if (!scene.includes("collapsed")) {
  writeSidebarCollapsedPref(false);
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
