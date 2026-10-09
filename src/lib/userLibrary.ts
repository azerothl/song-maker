export type SavedLibraryTrack = {
  projectId: string;
  generationId: string;
  title: string;
  addedAt: string;
  playlistIds: string[];
};

export type UserPlaylist = {
  id: string;
  title: string;
  createdAt: string;
};

export type UserLibrary = {
  version: 1;
  tracks: SavedLibraryTrack[];
  playlists: UserPlaylist[];
};

const emptyLibrary = (): UserLibrary => ({ version: 1, tracks: [], playlists: [] });

function storageKey(profileId: string | null): string {
  return `song-maker.user-library.v1.${profileId || "default"}`;
}

export function readUserLibrary(profileId: string | null): UserLibrary {
  if (typeof window === "undefined") return emptyLibrary();
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw) as Partial<UserLibrary>;
    return {
      version: 1,
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
    };
  } catch {
    return emptyLibrary();
  }
}

export function writeUserLibrary(profileId: string | null, library: UserLibrary): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function libraryTrackKey(track: Pick<SavedLibraryTrack, "projectId" | "generationId">): string {
  return `${track.projectId}:${track.generationId}`;
}

export function createLibraryId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
