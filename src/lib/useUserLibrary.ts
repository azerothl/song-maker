import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { api } from "./api";
import { readUserLibrary, writeUserLibrary, type UserLibrary } from "./userLibrary";

function hasSavedItems(library: UserLibrary): boolean {
  return library.tracks.length > 0 || library.playlists.length > 0;
}

export function useUserLibrary(
  profileId: string | null,
  onError: (message: string) => void,
) {
  const [library, setLibrary] = useState<UserLibrary>(() => readUserLibrary(profileId));
  const [revision, setRevision] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const local = readUserLibrary(profileId);
    setLibrary(local);
    setRevision(local.updatedAt ?? null);
    setLoaded(false);

    if (!isTauri()) {
      setLoaded(true);
      return () => { cancelled = true; };
    }

    void api.getUserLibrary().then(async (stored) => {
      if (stored) {
        if (cancelled) return;
        setLibrary(stored);
        setRevision(stored.updatedAt ?? null);
        writeUserLibrary(profileId, stored);
      } else if (hasSavedItems(local)) {
        const migrated = await api.saveUserLibrary(local, null);
        if (cancelled) return;
        setLibrary(migrated);
        setRevision(migrated.updatedAt ?? null);
        writeUserLibrary(profileId, migrated);
      } else if (!cancelled) {
        setLibrary({ version: 1, tracks: [], playlists: [] });
        setRevision(null);
      }
      if (!cancelled) setLoaded(true);
    }).catch((error) => {
      if (cancelled) return;
      setLibrary(local);
      setRevision(local.updatedAt ?? null);
      setLoaded(true);
      onError(String(error));
    });

    return () => { cancelled = true; };
  }, [profileId, onError]);

  const commit = useCallback(async (next: UserLibrary) => {
    if (!loaded || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (!isTauri()) {
        if (!writeUserLibrary(profileId, next)) throw new Error("Écriture de la Bibliothèque impossible.");
        setLibrary(next);
        return true;
      }
      const saved = await api.saveUserLibrary(next, revision);
      setLibrary(saved);
      setRevision(saved.updatedAt ?? null);
      writeUserLibrary(profileId, saved);
      return true;
    } catch (error) {
      try {
        const current = await api.getUserLibrary();
        if (current) {
          setLibrary(current);
          setRevision(current.updatedAt ?? null);
          writeUserLibrary(profileId, current);
        }
      } catch {
        // Keep the current in-memory view; the original save error is reported below.
      }
      onError(String(error));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [loaded, onError, profileId, revision]);

  return { library, commit, loaded, saving };
}
