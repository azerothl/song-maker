import { useEffect } from "react";
import { api } from "./lib/api";
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
        <div>{health?.gpuName ?? t("nav.gpuAbsent")}</div>
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

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshJob(), 1500);
    return () => window.clearInterval(id);
  }, [refreshJob, refreshHealth]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
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
