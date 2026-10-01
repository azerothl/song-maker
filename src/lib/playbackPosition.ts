/** Bus léger pour la position de lecture (RAF) sans repasser par React. */

const listeners = new Set<(seconds: number) => void>();

export function subscribePlaybackPosition(
  fn: (seconds: number) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitPlaybackPosition(seconds: number): void {
  for (const fn of listeners) fn(seconds);
}

export function clearPlaybackPositionListeners(): void {
  listeners.clear();
}
