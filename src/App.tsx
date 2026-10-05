import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { api } from "./lib/api";
import { shouldHandleSidebarToggleShortcut } from "./lib/sidebarKeyboard";
import { bindSidebarTipDismiss } from "./lib/sidebarTooltips";
import {
  applySidebarToggle,
  clearNarrowOverrideOnWideViewport,
  computeSidebarCollapsed,
  readSidebarCollapsedPref,
  SIDEBAR_NARROW_MEDIA,
  writeSidebarCollapsedPref,
} from "./lib/sidebarCollapse";
import { UpdateNotice } from "./components/UpdateNotice";
import { LibraryScreen } from "./screens/LibraryScreen";
import { LicensesScreen, SettingsScreen } from "./screens/SettingsScreen";
import { SongScreen } from "./screens/SongScreen";
import { ProfileMigrationBanner } from "./components/ProfileMigrationBanner";
import { ProfileSelector } from "./components/ProfileSelector";
import { ProfileOnboardingScreen } from "./screens/ProfileOnboardingScreen";
import { SplashScreen } from "./screens/SplashScreen";
import { useAppStore } from "./store/appStore";
import { t, useAppLocale } from "./ui/i18n";
import "./App.css";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ? `sidebar-icon ${className}` : "sidebar-icon"}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

function IconLibrary(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h5v14H4z" />
      <path d="M10 5h5v14h-5z" />
      <path d="M16 7.5 20 5v14l-4-2.5z" />
    </Icon>
  );
}

function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 17.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 6.1l1.6-1.6" />
    </Icon>
  );
}

function IconPanelCollapse(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      <path d="M14.5 9.5 12 12l2.5 2.5" />
    </Icon>
  );
}

function IconPanelExpand(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      <path d="M12 9.5 14.5 12 12 14.5" />
    </Icon>
  );
}

function IconGpu(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 6V4M12 6V4M16 6V4M8 20v-2M12 20v-2M16 20v-2" />
      <rect x="8" y="9" width="8" height="6" rx="1" />
    </Icon>
  );
}

function IconModel(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" />
    </Icon>
  );
}

function IconRuntime(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" />
    </Icon>
  );
}

function IconRestart(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 0 0-12-4.9L5 9M4 17v-5h5" />
      <path d="M5 12a7 7 0 0 0 12 4.9L19 15" />
    </Icon>
  );
}

function IconProject(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 18V7.5a2.5 2.5 0 0 1 4.2-1.8L15 7" />
      <circle cx="9" cy="18" r="2.5" />
    </Icon>
  );
}

function IconJob(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v4" />
      <path d="M12 16v4" />
      <path d="M4 12h4" />
      <path d="M16 12h4" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function useSidebarCollapsed() {
  const [userCollapsed, setUserCollapsed] = useState(readSidebarCollapsedPref);
  const [narrowOverride, setNarrowOverride] = useState(false);
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(SIDEBAR_NARROW_MEDIA).matches;
  });
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(SIDEBAR_NARROW_MEDIA);
    const sync = () => {
      const matches = mq.matches;
      setNarrow(matches);
      setNarrowOverride((prev) => clearNarrowOverrideOnWideViewport(matches, prev));
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const collapsed = computeSidebarCollapsed(userCollapsed, narrow, narrowOverride);
  const stateRef = useRef({ userCollapsed, narrow, narrowOverride });
  stateRef.current = { userCollapsed, narrow, narrowOverride };

  const toggle = (announce = false) => {
    const { userCollapsed: uc, narrow: nv, narrowOverride: no } = stateRef.current;
    const next = applySidebarToggle(uc, nv, no);
    setUserCollapsed(next.userCollapsed);
    setNarrowOverride(next.narrowOverride);
    if (!nv) writeSidebarCollapsedPref(next.userCollapsed);
    if (announce) {
      const after = computeSidebarCollapsed(next.userCollapsed, nv, next.narrowOverride);
      setLiveMessage(after ? t("nav.menuCollapsedLive") : t("nav.menuExpandedLive"));
    }
  };

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  return { collapsed, narrow, toggle, toggleRef, liveMessage };
}

function SidebarRow({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <div className="sidebar-row">
      {children}
      <span className="sidebar-tip" aria-hidden="true">{tip}</span>
    </div>
  );
}

export function Sidebar() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const health = useAppStore((s) => s.health);
  const job = useAppStore((s) => s.job);
  const project = useAppStore((s) => s.project);
  const openProject = useAppStore((s) => s.openProject);
  const setError = useAppStore((s) => s.setError);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const { collapsed, narrow, toggle, toggleRef, liveMessage } = useSidebarCollapsed();
  const [restartingRuntime, setRestartingRuntime] = useState(false);

  useEffect(() => {
    if (screen === "splash") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleSidebarToggleShortcut(event, event.target)) return;
      event.preventDefault();
      toggleRef.current(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, toggleRef]);

  useEffect(() => {
    if (screen === "splash") return;
    const root = document.querySelector(".app-shell");
    if (!root) return;
    root.classList.toggle("sidebar-collapsed", collapsed);
    return () => {
      root.classList.remove("sidebar-collapsed");
    };
  }, [collapsed, screen]);

  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (screen === "splash" || !collapsed) return;
    const el = sidebarRef.current;
    if (!el) return;
    return bindSidebarTipDismiss(el);
  }, [collapsed, screen]);

  if (screen === "splash" || screen === "profiles") return null;

  const gpuLabel = !health
    ? "…"
    : (health.gpuName ?? (health.cudaAvailable ? "GPU NVIDIA" : t("nav.gpuAbsent")));
  const modelName = health?.generationModel ?? "YuE2";
  const modelStatus = (() => {
    if (!health) return t("nav.statusChecking");
    if (!health.generationModelAvailable) return t("nav.modelUnavailable");
    if (!health.serverHealthy) return t("nav.modelAvailable");
    if (health.generationModelLoaded === true) return t("nav.modelLoaded");
    if (health.generationModelLoaded === false) return t("nav.modelReady");
    return t("nav.modelLoadUnknown");
  })();
  const runtimeStatus = !health
    ? t("nav.statusChecking")
    : health.serverHealthy
      ? t("nav.runtimeOnline")
      : t("nav.runtimeOffline");
  const runtimeAction = health?.serverHealthy
    ? t("nav.runtimeRestart")
    : t("nav.runtimeStart");
  const runtimeBusy = Boolean(
    job &&
      ["queued", "preparing", "generating", "separating", "importing_tracks"].includes(job.state),
  );
  const toggleLabel = collapsed ? t("nav.expandMenu") : t("nav.collapseMenu");
  const toggleTitle = collapsed
    ? toggleLabel
    : t("nav.collapseMenuShortcutTitle");
  const autoCollapsed = narrow && collapsed;

  return (
    <aside
      ref={sidebarRef}
      id="sidebar"
      className={`sidebar${collapsed ? " is-collapsed" : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
      data-auto={autoCollapsed ? "true" : "false"}
      aria-label={t("nav.sidebar")}
    >
      <div className="sidebar-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">♪</span>
          <span className="brand-name sidebar-label">{t("app.name")}</span>
        </div>
        <ProfileSelector collapsed={collapsed} />
        <SidebarRow
          tip={
            collapsed
              ? `${t("nav.expandMenu")} ${t("nav.shortcutKeys")}`
              : toggleLabel
          }
        >
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => toggle(true)}
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            aria-keyshortcuts="Control+B"
            title={toggleTitle}
            aria-label={toggleLabel}
          >
            {collapsed ? <IconPanelExpand /> : <IconPanelCollapse />}
            <span className="sidebar-toggle-text">
              <span className="sidebar-label">{toggleLabel}</span>
              {!collapsed && (
                <span className="sidebar-toggle-hint" aria-hidden="true">
                  <kbd>Ctrl</kbd>+<kbd>B</kbd>
                </span>
              )}
            </span>
          </button>
        </SidebarRow>
      </div>
      <div className="sidebar-sep" role="presentation" />
      <nav id="sidebar-nav" aria-label={t("nav.main")}>
        <SidebarRow tip={t("nav.library")}>
          <button
            type="button"
            className={screen === "library" ? "active" : ""}
            onClick={() => setScreen("library")}
            aria-label={t("nav.library")}
            aria-current={screen === "library" ? "page" : undefined}
          >
            <IconLibrary />
            <span className="sidebar-label">{t("nav.library")}</span>
          </button>
        </SidebarRow>
        <SidebarRow tip={t("nav.new")}>
          <button
            type="button"
            onClick={() => {
              const title = window.prompt("Titre") || "Sans titre";
              void api
                .createProject(title)
                .then((p) => openProject(p.id))
                .catch((e) => setError(String(e)));
            }}
            aria-label={t("nav.new")}
          >
            <IconPlus />
            <span className="sidebar-label">{t("nav.new")}</span>
          </button>
        </SidebarRow>
        <SidebarRow tip={t("nav.settings")}>
          <button
            type="button"
            className={screen === "settings" || screen === "licenses" ? "active" : ""}
            onClick={() => setScreen("settings")}
            aria-label={t("nav.settings")}
            aria-current={screen === "settings" || screen === "licenses" ? "page" : undefined}
          >
            <IconSettings />
            <span className="sidebar-label">{t("nav.settings")}</span>
          </button>
        </SidebarRow>
      </nav>
      <div className="sidebar-meta">
        <SidebarRow tip={gpuLabel}>
          <div
            className="sidebar-meta-row"
            role="group"
            aria-label={gpuLabel}
            tabIndex={collapsed ? 0 : undefined}
          >
            <IconGpu />
            <span className="sidebar-label">{gpuLabel}</span>
          </div>
        </SidebarRow>
        <SidebarRow tip={`${modelName} · ${modelStatus}`}>
          <div
            className={`sidebar-meta-row sidebar-model-row${health?.generationModelAvailable === true ? " is-ready" : health ? " is-unavailable" : ""}`}
            role="group"
            aria-label={`${t("nav.model")}: ${modelName}, ${modelStatus}`}
            tabIndex={collapsed ? 0 : undefined}
          >
            <IconModel />
            <span className="sidebar-model-copy sidebar-label">
              <strong>{modelName}</strong>
              <small>{modelStatus}</small>
            </span>
          </div>
        </SidebarRow>
        <SidebarRow tip={runtimeStatus}>
          <div
            className={`sidebar-meta-row sidebar-runtime-row${health?.serverHealthy === true ? " is-online" : health ? " is-offline" : ""}`}
            role="group"
            aria-label={`${t("nav.runtime")}: ${runtimeStatus}`}
            tabIndex={collapsed ? 0 : undefined}
          >
            <IconRuntime />
            <span className="sidebar-label">{runtimeStatus}</span>
          </div>
        </SidebarRow>
        {health && isTauri() && (
          <SidebarRow tip={runtimeBusy ? t("nav.runtimeBusy") : t("nav.runtimeActionHint")}>
            <button
              type="button"
              className="sidebar-runtime-restart"
              onClick={() => {
                if (runtimeBusy || restartingRuntime) return;
                setRestartingRuntime(true);
                void api
                  .restartAudioRuntime()
                  .then(() => refreshHealth())
                  .catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : String(reason));
                    return refreshHealth();
                  })
                  .finally(() => setRestartingRuntime(false));
              }}
              disabled={restartingRuntime}
              aria-disabled={runtimeBusy || undefined}
              title={runtimeBusy ? t("nav.runtimeBusy") : t("nav.runtimeActionHint")}
              aria-label={restartingRuntime ? t("nav.runtimeRestarting") : runtimeAction}
              aria-describedby={runtimeBusy ? "sidebar-runtime-busy" : undefined}
              aria-busy={restartingRuntime}
            >
              <IconRestart />
              <span className="sidebar-label">
                {restartingRuntime ? t("nav.runtimeRestarting") : runtimeAction}
              </span>
            </button>
            {runtimeBusy && (
              <span id="sidebar-runtime-busy" className="sr-only">
                {t("nav.runtimeBusy")}
              </span>
            )}
          </SidebarRow>
        )}
        {job && job.state !== "idle" && (
          <SidebarRow tip={job.label}>
            <div
              className="sidebar-meta-row job-step"
              role="group"
              aria-label={job.label}
              tabIndex={collapsed ? 0 : undefined}
            >
              <IconJob />
              <span className="sidebar-label">{job.label}</span>
            </div>
          </SidebarRow>
        )}
        {project && (
          <SidebarRow tip={project.title}>
            <div
              className="sidebar-meta-row open-title"
              role="group"
              aria-label={project.title}
              tabIndex={collapsed ? 0 : undefined}
            >
              <IconProject />
              <span className="sidebar-label">{project.title}</span>
            </div>
          </SidebarRow>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </div>
    </aside>
  );
}

export default function App() {
  const locale = useAppLocale();
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const refreshJob = useAppStore((s) => s.refreshJob);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const profilesState = useAppStore((s) => s.profilesState);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [profileBoot, setProfileBoot] = useState(false);

  useEffect(() => {
    void refreshProfiles().finally(() => setProfileBoot(true));
  }, [refreshProfiles]);

  useEffect(() => {
    if (!profileBoot || !profilesState) return;
    if (!profilesState.onboardingComplete && screen !== "profiles") {
      setScreen("profiles");
    }
  }, [profileBoot, profilesState, screen, setScreen]);

  useEffect(() => {
    if (!isTauri()) return;
    void refreshHealth();
    const healthId = window.setInterval(() => void refreshHealth(), 10_000);
    const jobId = window.setInterval(() => void refreshJob(), 1500);
    return () => {
      window.clearInterval(healthId);
      window.clearInterval(jobId);
    };
  }, [refreshJob, refreshHealth]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void check()
        .then((update) => {
          if (active && update) setAvailableUpdate(update);
        })
        .catch((reason) => console.info("Vérification de mise à jour indisponible :", reason));
    }, 2500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app-shell" data-locale={locale}>
      <Sidebar />
      <main className="main" key={screen}>
        {availableUpdate && (
          <UpdateNotice
            update={availableUpdate}
            onDismiss={() => {
              void availableUpdate.close();
              setAvailableUpdate(null);
            }}
          />
        )}
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        )}
        <ProfileMigrationBanner />
        {screen === "profiles" && <ProfileOnboardingScreen />}
        {screen === "splash" && <SplashScreen />}
        {screen === "library" && <LibraryScreen />}
        {screen === "song" && <SongScreen />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "licenses" && <LicensesScreen />}
      </main>
    </div>
  );
}
