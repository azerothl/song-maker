import { useEffect, useRef } from "react";
import { subscribePlaybackPosition } from "../lib/playbackPosition";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  /** Valeur initiale / hors lecture (pause, seek via React). */
  seconds: number;
  className?: string;
};

/** Affiche le temps courant sans re-render parent à chaque RAF. */
export function PlaybackTime({ seconds, className }: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.textContent = formatTime(seconds);
  }, [seconds]);

  useEffect(() => {
    return subscribePlaybackPosition((t) => {
      if (ref.current) ref.current.textContent = formatTime(t);
    });
  }, []);

  return <span ref={ref} className={className}>{formatTime(seconds)}</span>;
}
