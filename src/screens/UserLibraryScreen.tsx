import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import type { GenerationSummary, ProjectDoc } from "../lib/types";
import { libraryWaveColors, playlistHue } from "../lib/studioTrackColors";

type LibraryTrackDetails = {
  project: ProjectDoc;
  generation: GenerationSummary | undefined;
};

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
  const [trackDetails, setTrackDetails] = useState<Record<string, LibraryTrackDetails>>({});
  const [infoTrackKey, setInfoTrackKey] = useState<string | null>(null);
  const [playlistMenuFor, setPlaylistMenuFor] = useState<string | null>(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const nextAudioPaths: Record<string, string | null> = {};
      const nextTrackDetails: Record<string, LibraryTrackDetails> = {};
      const tracksByProject = new Map<string, typeof library.tracks>();
      for (const track of library.tracks) {
        const tracks = tracksByProject.get(track.projectId) ?? [];
        tracks.push(track);
        tracksByProject.set(track.projectId, tracks);
      }
      await Promise.all([...tracksByProject.entries()].map(async ([projectId, tracks]) => {
        try {
          const [project, generations] = await Promise.all([
            api.openProject(projectId),
            api.listGenerations(projectId),
          ]);
          for (const track of tracks) {
            const key = libraryTrackKey(track);
            const generation = generations.find((item) => item.id === track.generationId);
            nextAudioPaths[key] = generation?.audioPath ?? null;
            nextTrackDetails[key] = { project, generation };
          }
        } catch {
          for (const track of tracks) nextAudioPaths[libraryTrackKey(track)] = null;
        }
      }));
      if (!cancelled) {
        setAudioPaths(nextAudioPaths);
        setTrackDetails(nextTrackDetails);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [library.tracks]);

  useEffect(() => {
    if (!infoTrackKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInfoTrackKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [infoTrackKey]);

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

  function createPlaylistAndAdd(trackKey: string) {
    const title = newPlaylistTitle.trim();
    if (!title) return;
    const playlist = { id: createLibraryId(), title, createdAt: new Date().toISOString() };
    void commit({
      ...library,
      playlists: [...library.playlists, playlist],
      tracks: library.tracks.map((track) =>
        libraryTrackKey(track) !== trackKey
          ? track
          : { ...track, playlistIds: [...track.playlistIds, playlist.id] },
      ),
    });
    setNewPlaylistTitle("");
    setPlaylistMenuFor(null);
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
    if (infoTrackKey === trackKey) setInfoTrackKey(null);
  }

  function toggleLike(trackKey: string) {
    void commit({
      ...library,
      tracks: library.tracks.map((track) =>
        libraryTrackKey(track) === trackKey ? { ...track, liked: !track.liked } : track,
      ),
    });
  }

  function incrementPlayCount(trackKey: string) {
    void commit({
      ...library,
      tracks: library.tracks.map((track) =>
        libraryTrackKey(track) === trackKey
          ? { ...track, playCount: (track.playCount ?? 0) + 1 }
          : track,
      ),
    });
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
                style={{ "--playlist-hue": playlistHue(playlist.id) } as CSSProperties}
                aria-pressed={playlistFilter === playlist.id}
                onClick={() => setPlaylistFilter(playlist.id)}
              >
                {playlist.title}
              </button>
              <button
                type="button"
                className="playlist-delete"
                disabled={!libraryLoaded || librarySaving}
                aria-label={t("library.playlistDelete", { title: playlist.title })}
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
                      generationId={track.generationId}
                      trackKey={key}
                      {...libraryWaveColors(key)}
                      onPlay={() => incrementPlayCount(key)}
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
                          style={{ "--playlist-hue": playlistHue(id) } as CSSProperties}
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
                  <span className="user-library-play-count" aria-label={t("library.playCount", { count: track.playCount ?? 0 })}>
                    ▶ {track.playCount ?? 0}
                  </span>
                  <button
                    type="button"
                    className="user-library-icon-button"
                    disabled={!libraryLoaded || librarySaving}
                    aria-label={track.liked ? t("library.unlike") : t("library.like")}
                    title={track.liked ? t("library.unlike") : t("library.like")}
                    aria-pressed={Boolean(track.liked)}
                    onClick={() => toggleLike(key)}
                  >
                    <span aria-hidden="true">{track.liked ? "♥" : "♡"}</span>
                  </button>
                  <button
                    type="button"
                    className="user-library-icon-button"
                    aria-label={t("library.information")}
                    title={t("library.information")}
                    onClick={() => setInfoTrackKey(key)}
                  >
                    <span aria-hidden="true">ⓘ</span>
                  </button>
                  <button
                    type="button"
                    className="user-library-icon-button"
                    disabled={!libraryLoaded || librarySaving}
                    aria-label={t("library.addToPlaylist")}
                    aria-expanded={playlistMenuFor === key}
                    aria-haspopup="dialog"
                    title={t("library.addToPlaylist")}
                    onClick={() => {
                      setNewPlaylistTitle("");
                      setPlaylistMenuFor((current) => current === key ? null : key);
                    }}
                  >
                    <span aria-hidden="true">▤+</span>
                  </button>
                  {playlistMenuFor === key && (
                    <div
                      className="playlist-picker-popover"
                      role="dialog"
                      aria-label={t("library.addToPlaylist")}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setPlaylistMenuFor(null);
                      }}
                    >
                      <strong>{t("library.playlists")}</strong>
                      <div className="playlist-picker-options">
                        {library.playlists.map((playlist) => {
                          const alreadyAdded = track.playlistIds.includes(playlist.id);
                          return (
                            <button
                              key={playlist.id}
                              type="button"
                              className="playlist-picker-option"
                              style={{ "--playlist-hue": playlistHue(playlist.id) } as CSSProperties}
                              disabled={alreadyAdded || !libraryLoaded || librarySaving}
                              onClick={() => {
                                void addToPlaylist(key, playlist.id);
                                setPlaylistMenuFor(null);
                              }}
                            >
                              <span>{playlist.title}</span>
                              {alreadyAdded && <span aria-label={t("library.playlistAlreadyAdded")}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                      <form
                        className="playlist-picker-create"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void createPlaylistAndAdd(key);
                        }}
                      >
                        <label>
                          <span>{t("library.playlistNamePrompt")}</span>
                          <input
                            value={newPlaylistTitle}
                            onChange={(event) => setNewPlaylistTitle(event.target.value)}
                            maxLength={64}
                          />
                        </label>
                        <button type="submit" className="btn primary" disabled={!newPlaylistTitle.trim() || !libraryLoaded || librarySaving}>
                          {t("library.playlistCreateAndAdd")}
                        </button>
                      </form>
                    </div>
                  )}
                  <button
                    type="button"
                    className="user-library-icon-button"
                    disabled={!libraryLoaded || librarySaving}
                    aria-label={t("library.removeSavedTrack")}
                    title={t("library.removeSavedTrack")}
                    onClick={() => removeTrack(key)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {infoTrackKey && (() => {
        const infoTrack = library.tracks.find((track) => libraryTrackKey(track) === infoTrackKey);
        if (!infoTrack) return null;
        const details = trackDetails[infoTrackKey];
        const createdAt = details?.generation?.createdAt ?? details?.project.createdAt ?? infoTrack.addedAt;
        const style = details?.project.style.trim();
        const lyrics = details?.project.lyrics.trim();
        return (
          <div
            className="user-library-info-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setInfoTrackKey(null);
            }}
          >
            <section
              className="user-library-info-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-library-info-title"
            >
              <header>
                <div>
                  <p className="studio-midi-editor-eyebrow">{t("library.information")}</p>
                  <h2 id="user-library-info-title">{projectById.get(infoTrack.projectId)?.title ?? infoTrack.title}</h2>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  autoFocus
                  onClick={() => setInfoTrackKey(null)}
                  aria-label={t("production.arrangement.close")}
                >
                  ×
                </button>
              </header>
              <p><strong>{t("library.createdAt")}</strong> {createdAt ? new Date(createdAt).toLocaleString() : t("library.informationUnavailable")}</p>
              <h3>{t("library.stylePrompt")}</h3>
              {style ? <p>{style}</p> : <p className="library-info-empty">{t("library.informationUnavailable")}</p>}
              <h3>{t("library.lyrics")}</h3>
              {lyrics ? <p className="library-info-lyrics">{lyrics}</p> : <p className="library-info-empty">{t("library.informationUnavailable")}</p>}
            </section>
          </div>
        );
      })()}
    </section>
  );
}
