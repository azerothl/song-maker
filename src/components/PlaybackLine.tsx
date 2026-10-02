import { useEffect, useRef } from "react";
import { subscribePlaybackPosition } from "../lib/playbackPosition";

type Props = {
  /** Position hors lecture (pause / seek React). */
  currentMs: number;
  timelineMs: number;
  className?: string;
};

function pct(currentMs: number, timelineMs: number): number {
  if (!(timelineMs > 0)) return 0;
  return Math.min(100, Math.max(0, (currentMs / timelineMs) * 100));
}

/**
 * Playhead span that advances via the RAF playback bus (like Waveform / PlaybackTime),
 * without re-rendering the whole timeline on every frame.
 */
export function PlaybackLine({
  currentMs,
  timelineMs,
  className = "production-playback-line",
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.style.left = `${pct(currentMs, timelineMs)}%`;
  }, [currentMs, timelineMs]);

  useEffect(() => {
    return subscribePlaybackPosition((seconds) => {
      if (ref.current) {
        ref.current.style.left = `${pct(seconds * 1000, timelineMs)}%`;
      }
    });
  }, [timelineMs]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ left: `${pct(currentMs, timelineMs)}%` }}
    />
  );
}
