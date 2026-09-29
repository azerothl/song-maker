import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { api } from "./lib/api";
import { UpdateNotice } from "./components/UpdateNotice";
import { LibraryScreen } from "./screens/LibraryScreen";
import { LicensesScreen, SettingsScreen } from "./screens/SettingsScreen";
import { SongScreen } from "./screens/SongScreen";
import { SplashScreen } from "./screens/SplashScreen";
import { useAppStore } from "./store/appStore";
import { t } from "./ui/i18n";
import "./App.css";

function Sidebar() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const health = useAppStore((s) => s.health);
  const job = useAppStore((s) => s.job);
  const project = useAppStore((s) => s.project);
  const openProject = useAppStore((s) => s.openProject);
  const setError = useAppStore((s) => s.setError);

  if (screen === "splash") return null;

  return (
    <aside className="sidebar">
      <div className="brand">{t("app.name")}</div>
      <nav>
        <button
          type="button"
          className={screen === "library" ? "active" : ""}
          onClick={() => setScreen("library")}
        >
          {t("nav.library")}
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
        >
          {t("nav.new")}
        </button>
        <button
          type="button"
          className={screen === "settings" || screen === "licenses" ? "active" : ""}
          onClick={() => setScreen("settings")}
        >
          {t("nav.settings")}
        </button>
      </nav>
      <div className="sidebar-meta">
        <div>
          {!health
            ? "…"
            : health.gpuName ??
              (health.cudaAvailable ? "GPU NVIDIA" : t("nav.gpuAbsent"))}
        </div>
        {job && job.state !== "idle" && <div className="job-step">{job.label}</div>}
        {project && <div className="open-title">{project.title}</div>}
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
