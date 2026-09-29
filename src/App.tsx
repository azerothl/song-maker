import { useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { api } from "./lib/api";
import {
  SIDEBAR_NARROW_MEDIA,
  effectiveSidebarCollapsed,
  readSidebarCollapsedPref,
  writeSidebarCollapsedPref,
} from "./lib/sidebarCollapse";
import { UpdateNotice } from "./components/UpdateNotice";
import { LibraryScreen } from "./screens/LibraryScreen";
import { LicensesScreen, SettingsScreen } from "./screens/SettingsScreen";
import { SongScreen } from "./screens/SongScreen";
import { SplashScreen } from "./screens/SplashScreen";
import { useAppStore } from "./store/appStore";
import { t } from "./ui/i18n";
import "./App.css";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
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
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(SIDEBAR_NARROW_MEDIA).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(SIDEBAR_NARROW_MEDIA);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const collapsed = effectiveSidebarCollapsed(userCollapsed, narrow);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const setCollapsed = (next: boolean) => {
    setUserCollapsed(next);
    writeSidebarCollapsedPref(next);
  };

  const toggle = () => setCollapsed(!collapsedRef.current);

  return { collapsed, toggle };
}

function Sidebar() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const health = useAppStore((s) => s.health);
  const job = useAppStore((s) => s.job);
  const project = useAppStore((s) => s.project);
  const openProject = useAppStore((s) => s.openProject);
  const setError = useAppStore((s) => s.setError);
  const { collapsed, toggle } = useSidebarCollapsed();
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    if (screen === "splash") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "b") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);

  useEffect(() => {
    if (screen === "splash") return;
    const root = document.querySelector(".app-shell");
    if (!root) return;
    root.classList.toggle("sidebar-collapsed", collapsed);
    return () => {
      root.classList.remove("sidebar-collapsed");
    };
  }, [collapsed, screen]);

  if (screen === "splash") return null;

  const gpuLabel = !health
    ? "…"
    : (health.gpuName ?? (health.cudaAvailable ? "GPU NVIDIA" : t("nav.gpuAbsent")));
  const toggleLabel = collapsed ? t("nav.expandMenu") : t("nav.collapseMenu");

  return (
    <aside
      className={`sidebar${collapsed ? " is-collapsed" : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={t("nav.sidebar")}
    >
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          {collapsed ? <IconPanelExpand /> : <IconPanelCollapse />}
          <span className="sidebar-label">{toggleLabel}</span>
        </button>
        {!collapsed && <div className="brand">{t("app.name")}</div>}
      </div>
      <nav id="sidebar-nav" aria-label={t("nav.main")}>
        <button
          type="button"
          className={screen === "library" ? "active" : ""}
          onClick={() => setScreen("library")}
          title={t("nav.library")}
          aria-label={t("nav.library")}
          aria-current={screen === "library" ? "page" : undefined}
        >
          <IconLibrary />
          <span className="sidebar-label">{t("nav.library")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const title = window.prompt("Titre") || "Sans titre";
            void api
              .createProject(title)
              .then((p) => openProject(p.id))
              .catch((e) => setError(String(e)));
          }}
          title={t("nav.new")}
          aria-label={t("nav.new")}
        >
          <IconPlus />
          <span className="sidebar-label">{t("nav.new")}</span>
        </button>
        <button
          type="button"
          className={screen === "settings" || screen === "licenses" ? "active" : ""}
          onClick={() => setScreen("settings")}
          title={t("nav.settings")}
          aria-label={t("nav.settings")}
          aria-current={screen === "settings" || screen === "licenses" ? "page" : undefined}
        >
          <IconSettings />
          <span className="sidebar-label">{t("nav.settings")}</span>
        </button>
      </nav>
      <div className="sidebar-meta">
        <div className="sidebar-meta-row" title={gpuLabel} aria-label={gpuLabel}>
          <IconGpu />
          <span className="sidebar-label">{gpuLabel}</span>
        </div>
        {job && job.state !== "idle" && (
          <div className="sidebar-meta-row job-step" title={job.label} aria-label={job.label}>
            <IconJob />
            <span className="sidebar-label">{job.label}</span>
          </div>
        )}
        {project && (
          <div
            className="sidebar-meta-row open-title"
            title={project.title}
            aria-label={project.title}
          >
            <IconProject />
            <span className="sidebar-label">{project.title}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  const screen = useAppStore((s) => s.screen);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const refreshJob = useAppStore((s) => s.refreshJob);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void refreshHealth();
    const jobId = window.setInterval(() => void refreshJob(), 1500);
    return () => window.clearInterval(jobId);
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
    <div className="app-shell">
      <Sidebar />
      <main className="main">
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
        {screen === "splash" && <SplashScreen />}
        {screen === "library" && <LibraryScreen />}
        {screen === "song" && <SongScreen />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "licenses" && <LicensesScreen />}
      </main>
    </div>
  );
}
