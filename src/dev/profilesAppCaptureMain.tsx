import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { useAppStore } from "../store/appStore";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import {
  seedManyProfilesCaptureStore,
  seedOnboardingCaptureStore,
  seedProfilesCaptureStore,
} from "./seedProfilesCaptureStore";
import {
  measureExpandedMenuOpen,
  measureMenuSixProfilesViewport,
  measureProfilePopoverCollapsed,
} from "./profileIssue215Metrics";
import { applySidebarCapturePrefs } from "./sidebarCaptureMain";
import "../App.css";

type ProfileAppCaptureScene =
  | "onboarding-commercial-disabled"
  | "onboarding-six-max"
  | "selector-closed"
  | "selector-open"
  | "selector-collapsed"
  | "selector-collapsed-open"
  | "selector-many-profiles"
  | "selector-many-profiles-open"
  | "switch-confirm"
  | "switch-blocked-generation"
  | "commercial-engines-fixture"
  | "migration-banner";

function parseScene(hash: string): ProfileAppCaptureScene {
  const h = hash.replace(/^#/, "").toLowerCase();
  if (h.includes("six-max")) return "onboarding-six-max";
  if (h.includes("commercial-disabled")) return "onboarding-commercial-disabled";
  if (
    h.includes("many-profiles") &&
    (h.includes("collapsed-menu-open") || h.includes("selector-collapsed-open"))
  ) {
    return "selector-many-profiles-open";
  }
  if (h.includes("collapsed-menu-open") || h.includes("selector-collapsed-open")) {
    return "selector-collapsed-open";
  }
  if (h.includes("many-profiles")) return "selector-many-profiles";
  if (h.includes("selector-open") && !h.includes("collapsed")) return "selector-open";
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
} else if (scene === "selector-many-profiles" || scene === "selector-many-profiles-open") {
  seedManyProfilesCaptureStore();
} else {
  seedProfilesCaptureStore();
}

if (scene === "switch-blocked-generation") {
  useAppStore.setState({
    job: { state: "generating", label: "Génération en cours · étape 2/4" },
  });
}

if (
  scene === "selector-collapsed" ||
  scene === "selector-collapsed-open" ||
  scene === "selector-many-profiles-open"
) {
  writeSidebarCollapsedPref(true);
} else if (!scene.includes("collapsed")) {
  writeSidebarCollapsedPref(false);
}

declare global {
  interface Window {
    __profileIssue215PopoverMetrics?: () => ReturnType<typeof measureProfilePopoverCollapsed>;
    __profileIssue215ExpandedMenu?: () => ReturnType<typeof measureExpandedMenuOpen>;
    __profileIssue215MenuSixViewport?: () => ReturnType<typeof measureMenuSixProfilesViewport>;
  }
}

window.__profileIssue215PopoverMetrics = () => measureProfilePopoverCollapsed();
window.__profileIssue215ExpandedMenu = () => measureExpandedMenuOpen();
window.__profileIssue215MenuSixViewport = () => measureMenuSixProfilesViewport();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
