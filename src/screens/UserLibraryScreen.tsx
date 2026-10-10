import { useEffect, useMemo, useState } from "react";
import { LibraryTrackPlayer } from "../components/LibraryTrackPlayer";
import { api } from "../lib/api";
import { useUserLibrary } from "../lib/useUserLibrary";
import {
  createLibraryId,
  libraryTrackKey,
} from "../lib/userLibrary";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";
import { ProfileKindBadge } from "../components/ProfileKindBadge";

export function UserLibraryScreen() {
  const projects = useAppStore((s) => s.projects);
  const refreshLibrary = useAppStore((s) => s.refreshLibrary);
  const activeProfileId = useAppStore((s) => s.profilesState?.activeProfileId ?? null);
  const setScreen = useAppStore((s) => s.setScreen);
  const setError = useAppStore((s) => s.setError);
  const { library, commit, loaded: libraryLoaded, saving: librarySaving } = useUserLibrary(activeProfileId, setError);
  const [query, setQuery] = useState("");
  const [playlistFilter, setPlaylistFilter] = useState<string | null>(null);
  const [audioPaths, setAudioPaths] = useState<Record<string, string | null>>({});

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      library.tracks.map(async (track) => {
        try {
          const generations = await api.listGenerations(track.projectId);
          const generation = generations.find((item) => item.id === track.generationId);
          return [libraryTrackKey(track), generation?.audioPath ?? null] as const;
        } catch {
          return [libraryTrackKey(track), null] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setAudioPaths(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [library.tracks]);

  function createPlaylist() {
    const title = window.prompt(t("library.playlistNamePrompt"))?.trim();
    if (!title) return;
    if ([...title].length > 120) {
      setError(t("library.playlistNameInvalid"));
      return;
    }
    void commit({
      ...library,
      playlists: [...library.playlists, { id: createLibraryId(), title, createdAt: new Date().toISOString() }],
    });
  }

  function deletePlaylist(id: string, title: string) {
    if (!window.confirm(t("library.playlistDeleteConfirm", { title }))) return;
    void commit({
      ...library,
      playlists: library.playlists.filter((playlist) => playlist.id !== id),
      tracks: library.tracks.map((track) => ({
        ...track,
        playlistIds: track.playlistIds.filter((playlistId) => playlistId !== id),
      })),
    });
    if (playlistFilter === id) setPlaylistFilter(null);
  }

  function addToPlaylist(trackKey: string, playlistId: string) {
    if (!playlistId) return;
    void commit({
      ...library,
      tracks: library.tracks.map((track) =>
        libraryTrackKey(track) !== trackKey || track.playlistIds.includes(playlistId)
          ? track
          : { ...track, playlistIds: [...track.playlistIds, playlistId] },
      ),
    });
  }

  function removeFromPlaylist(trackKey: string, playlistId: string) {
    void commit({
      ...library,
      tracks: library.tracks.map((track) =>
        libraryTrackKey(track) !== trackKey
          ? track
          : { ...track, playlistIds: track.playlistIds.filter((id) => id !== playlistId) },
      ),
    });
  }

  function removeTrack(trackKey: string) {
    void commit({ ...library, tracks: library.tracks.filter((track) => libraryTrackKey(track) !== trackKey) });
  }

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const visibleTracks = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return library.tracks.filter((track) => {
      const project = projectById.get(track.projectId);
      const title = project?.title ?? track.title;
      return (!playlistFilter || track.playlistIds.includes(playlistFilter)) &&
        (!search || title.toLocaleLowerCase().includes(search));
    });
  }, [library.tracks, playlistFilter, projectById, query]);

  return (
    <section className="panel library user-library">
      <header className="panel-header">
        <div>
          <h1 className="song-title-with-badge">
            {t("nav.library")}
            <ProfileKindBadge />
          </h1>
          <p className="hint">{t("library.savedOnlyHint")}</p>
        </div>
        <button type="button" className="btn primary" disabled={!libraryLoaded || librarySaving} onClick={createPlaylist}>
          {t("library.playlistCreate")}
        </button>
      </header>

      <div className="user-library-toolbar">
        <input
          className="search"
          type="search"
          placeholder={t("library.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <nav className="playlist-filters" aria-label={t("library.playlists")}>
          <button
            type="button"
            className={playlistFilter === null ? "active" : ""}
            aria-pressed={playlistFilter === null}
            onClick={() => setPlaylistFilter(null)}
          >
            {t("library.allTracks")}
          </button>
          {library.playlists.map((playlist) => (
            <span className="playlist-filter-item" key={playlist.id}>
              <button
                type="button"
                className={playlistFilter === playlist.id ? "active" : ""}
                aria-pressed={playlistFilter === playlist.id}
                onClick={() => setPlaylistFilter(playlist.id)}
              >
                {playlist.title}
              </button>
              <button
                type="button"
                className="playlist-delete"
                aria-label={t("library.playlistDelete", { title: playlist.title })}
                disabled={!libraryLoaded || librarySaving}
                onClick={() => deletePlaylist(playlist.id, playlist.title)}
              >
                ×
              </button>
            </span>
          ))}
        </nav>
      </div>

      {visibleTracks.length === 0 ? (
        <div className="user-library-empty">
          <h2>{library.tracks.length === 0 ? t("library.emptySavedTitle") : t("library.emptyPlaylistTitle")}</h2>
          <p>{library.tracks.length === 0 ? t("library.emptySavedBody") : t("library.emptyPlaylistBody")}</p>
          <button type="button" className="btn" onClick={() => setScreen("projects")}>
            {t("nav.projects")}
          </button>
        </div>
      ) : (
        <ul className="user-library-list">
          {visibleTracks.map((track) => {
            const key = libraryTrackKey(track);
            const title = projectById.get(track.projectId)?.title ?? track.title;
            const audioPath = audioPaths[key];
            return (
              <li className="user-library-track" key={key}>
                <div className="user-library-track-main">
                  <div className="user-library-track-title">
                    <strong>{title}</strong>
                    <span>{t("library.savedFromProject")}</span>
                  </div>
                  {audioPath ? (
                    <LibraryTrackPlayer
                      audioPath={audioPath}
                      label={title}
                      projectId={track.projectId}
                      trackKey={key}
                    />
                  ) : (
                    <p className="hint" role="status">{t("library.audioUnavailable")}</p>
                  )}
                  <div className="user-library-track-playlists">
                    {track.playlistIds.map((id) => {
                      const playlist = library.playlists.find((item) => item.id === id);
                      if (!playlist) return null;
                      return (
                        <button
                          type="button"
                          className="playlist-chip"
                          key={id}
                          disabled={!libraryLoaded || librarySaving}
                          onClick={() => removeFromPlaylist(key, id)}
                          aria-label={t("library.removeFromPlaylist", { title: playlist.title })}
                        >
                          {playlist.title} <span aria-hidden="true">×</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="user-library-track-actions">
                  <label>
                    <span className="sr-only">{t("library.addToPlaylist")}</span>
                    <select
                      value=""
                      disabled={!libraryLoaded || librarySaving || library.playlists.length === 0}
                      onChange={(event) => addToPlaylist(key, event.target.value)}
                    >
                      <option value="">{t("library.addToPlaylist")}</option>
                      {library.playlists.map((playlist) => (
                        <option key={playlist.id} value={playlist.id} disabled={track.playlistIds.includes(playlist.id)}>
                          {playlist.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn ghost" disabled={!libraryLoaded || librarySaving} onClick={() => removeTrack(key)}>
                    {t("library.removeSavedTrack")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
