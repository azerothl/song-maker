const STORAGE_KEY = "song-maker:production-track-auto-visible";
const listeners = new Set<() => void>();

export function subscribeTrackAutomationVisible(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isTrackAutomationVisible(trackId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[trackId]);
  } catch {
    return false;
  }
}

export function setTrackAutomationVisible(trackId: string, visible: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    if (visible) map[trackId] = true;
    else delete map[trackId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  for (const listener of listeners) listener();
}
