/** Seuil (s) : retour près de 0 après lecture avancée = nouveau départ. */
export const PLAYBACK_RESTART_RESUME_THRESHOLD = 0.75;

/**
 * Reprend le suivi automatique au prochain départ de lecture
 * (seek / rebobinage vers le début).
 */
export function shouldResumeFollowOnPlaybackRestart(
  previousSeconds: number,
  nextSeconds: number,
): boolean {
  return (
    Number.isFinite(previousSeconds) &&
    Number.isFinite(nextSeconds) &&
    previousSeconds > PLAYBACK_RESTART_RESUME_THRESHOLD &&
    nextSeconds < 0.05
  );
}

/** Applique la reprise du suivi après un tick de position (bus RAF ou prop). */
export function followPlaybackAfterPositionTick(
  previousSeconds: number,
  nextSeconds: number,
  followPlayback: boolean,
): boolean {
  if (shouldResumeFollowOnPlaybackRestart(previousSeconds, nextSeconds)) {
    return true;
  }
  return followPlayback;
}

/** Défile la portée ; instantané si l'utilisateur préfère moins d'animation. */
export function staffScrollTopTo(
  scrollEl: HTMLElement,
  targetTop: number,
  reducedMotion: boolean,
): void {
  const top = Math.max(0, targetTop);
  if (reducedMotion) {
    scrollEl.scrollTop = top;
    return;
  }
  scrollEl.scrollTo({ top, behavior: "smooth" });
}
