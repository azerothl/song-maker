import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

function formatDuration(ms?: number | null): string {
  if (ms == null || ms <= 0) return t("library.dash");
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR");
  } catch {
    return iso;
  }
}

export function LibraryScreen() {
  const projects = useAppStore((s) => s.projects);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const openProject = useAppStore((s) => s.openProject);
  const setError = useAppStore((s) => s.setError);
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    void refreshLibrary(query || undefined);
  }, [query, refreshLibrary]);

  async function onNew() {
    const title = window.prompt("Titre du morceau");
    if (!title) return;
    try {
      const doc = await api.createProject(title);
      await openProject(doc.id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRename(id: string, current: string) {
    const title = window.prompt(t("library.rename"), current);
    if (!title) return;
    try {
      await api.renameProject(id, title);
      await refreshLibrary(query || undefined);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onDelete(id: string, title: string) {
    if (!window.confirm(t("library.deleteConfirm", { title }))) return;
    try {
      await api.deleteProject(id);
      await refreshLibrary(query || undefined);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="panel library">
      <header className="panel-header">
        <h1>{t("nav.library")}</h1>
        <button type="button" className="btn primary" onClick={() => void onNew()}>
          {t("library.new")}
        </button>
      </header>
      <input
        className="search"
        placeholder={t("library.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {projects.length === 0 ? (
        <p className="empty">{t("library.empty")}</p>
      ) : (
        <table className="library-table">
          <thead>
            <tr>
              <th>{t("library.title")}</th>
              <th>{t("library.duration")}</th>
              <th>{t("library.updated")}</th>
              <th>{t("library.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => void openProject(p.id)}
                  >
                    {p.title}
                  </button>
                </td>
                <td>{formatDuration(p.durationMs)}</td>
                <td>{formatUpdated(p.updatedAt)}</td>
                <td>{t(`status.${p.status}` as "status.empty")}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                  >
                    ···
                  </button>
                  {menuId === p.id && (
                    <div className="menu">
                      <button type="button" onClick={() => void onRename(p.id, p.title)}>
                        {t("library.rename")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void api.duplicateProject(p.id).then(() => refreshLibrary())
                        }
                      >
                        {t("library.duplicate")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void api.exportAudio(p.id, "wav").catch((e) => setError(String(e)))
                        }
                      >
                        {t("library.export")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void api.revealProject(p.id).then((path) => window.alert(path))
                        }
                      >
                        {t("library.reveal")}
                      </button>
                      <button type="button" onClick={() => void onDelete(p.id, p.title)}>
                        {t("library.delete")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
