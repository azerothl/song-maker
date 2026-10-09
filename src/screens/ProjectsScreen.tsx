import { useEffect, useState } from "react";
import { ProjectSyncPanel } from "../components/ProjectSyncPanel";
import { api } from "../lib/api";
import { exportProjectAudio } from "../lib/exportMix";
import { useAppStore } from "../store/appStore";
import { ProfileKindBadge } from "../components/ProfileKindBadge";
import { t } from "../ui/i18n";
import { libraryTrackKey, readUserLibrary, writeUserLibrary, type SavedLibraryTrack } from "../lib/userLibrary";

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

export function ProjectsScreen() {
  const projects = useAppStore((s) => s.projects);
  const activeProfileId = useAppStore((s) => s.profilesState?.activeProfileId ?? null);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const openProject = useAppStore((s) => s.openProject);
  const setError = useAppStore((s) => s.setError);
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [syncProjectId, setSyncProjectId] = useState<string | null>(null);
  const [savedTracks, setSavedTracks] = useState<SavedLibraryTrack[]>(
    () => readUserLibrary(activeProfileId).tracks,
  );

  useEffect(() => {
    void refreshLibrary(query || undefined);
  }, [query, refreshLibrary]);

  useEffect(() => {
    setSavedTracks(readUserLibrary(activeProfileId).tracks);
  }, [activeProfileId]);

  async function onNew() {
    const title = window.prompt(t("projects.newNamePrompt"));
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
    if (!window.confirm(t("projects.deleteConfirm", { title }))) return;
    try {
      await api.deleteProject(id);
      const library = readUserLibrary(activeProfileId);
      const tracks = library.tracks.filter((track) => track.projectId !== id);
      if (!writeUserLibrary(activeProfileId, { ...library, tracks })) {
        setError(t("library.storageError"));
      } else {
        setSavedTracks(tracks);
      }
      await refreshLibrary(query || undefined);
    } catch (e) {
      setError(String(e));
    }
  }

  function toggleLibraryTrack(projectId: string, generationId: string, title: string) {
    const library = readUserLibrary(activeProfileId);
    const key = libraryTrackKey({ projectId, generationId });
    const exists = library.tracks.some((track) => libraryTrackKey(track) === key);
    const tracks = exists
      ? library.tracks.filter((track) => libraryTrackKey(track) !== key)
      : [...library.tracks, { projectId, generationId, title, addedAt: new Date().toISOString(), playlistIds: [] }];
    if (!writeUserLibrary(activeProfileId, { ...library, tracks })) {
      setError(t("library.storageError"));
      return;
    }
    setSavedTracks(tracks);
  }

  return (
    <div className="panel library">
      <header className="panel-header">
        <h1 className="song-title-with-badge">
          {t("nav.projects")}
          <ProfileKindBadge />
        </h1>
        <div className="library-header-actions">
          <button type="button" className="btn primary" onClick={() => void onNew()}>
            {t("projects.new")}
          </button>
        </div>
      </header>
      <input
        className="search"
        placeholder={t("library.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {projects.length === 0 ? (
        <div className="user-library-empty">
          <h2>{t("projects.emptyTitle")}</h2>
          <p>{t("projects.emptyBody")}</p>
        </div>
      ) : (
        <table className="library-table">
          <thead>
            <tr>
              <th>{t("library.title")}</th>
              <th>{t("library.duration")}</th>
              <th>{t("library.updated")}</th>
              <th>{t("library.status")}</th>
              <th>{t("projects.library")}</th>
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
                <td>
                  {p.activeGenerationId ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => toggleLibraryTrack(p.id, p.activeGenerationId!, p.title)}
                    >
                      {savedTracks.some((track) => libraryTrackKey(track) === libraryTrackKey({ projectId: p.id, generationId: p.activeGenerationId! }))
                        ? t("projects.removeFromLibrary")
                        : t("projects.addToLibrary")}
                    </button>
                  ) : (
                    <span className="hint">{t("projects.noMixYet")}</span>
                  )}
                </td>
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
                          void (async () => {
                            try {
                              const mix = await api.loadMix(p.id);
                              if (mix?.vst3MasterInsert?.enabled) {
                                const sources = await api.playbackSources(p.id);
                                await exportProjectAudio(p.id, "wav", mix, sources);
                              } else {
                                await api.exportAudio(p.id, "wav");
                              }
                            } catch (e) {
                              setError(String(e));
                            }
                          })()
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
                      <button
                        type="button"
                        onClick={() => {
                          setMenuId(null);
                          setSyncProjectId(p.id);
                        }}
                      >
                        {t("projects.sync")}
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
      {syncProjectId && (
        <ProjectSyncPanel
          projectId={syncProjectId}
          onClose={() => setSyncProjectId(null)}
        />
      )}
    </div>
  );
}
