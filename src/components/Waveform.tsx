import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { subscribePlaybackPosition } from "../lib/playbackPosition";
import { t } from "../ui/i18n";
import {
  buildWaveformLayers,
  paintWaveformProgress,
  readCanvasBackdrop,
  resolveDrawColors,
  resolveMutedDrawColors,
  type WaveformLayerBitmap,
} from "./waveformDraw";

export type WaveformStatus = "ready" | "loading" | "empty";

type Props = {
  peaks: Float32Array | null;
  progress: number;
  duration: number;
  height?: number;
  onSeek?: (seconds: number) => void;
  /** Visible caption beside the canvas (player mix/stereo wave). */
  label?: string;
  /** Accessible name; defaults to `label` or a generic waveform label. */
  ariaLabel?: string;
  muted?: boolean;
  /** Explicit state when peaks are not drawable yet. */
  status?: WaveformStatus;
  /** Unplayed bar color (`#rrggbb` / `rgb()`). Overrides `role` and CSS vars. */
  color?: string;
  /** Played bar color. Overrides `role` and CSS vars. */
  playedColor?: string;
  /** Stem role — maps to track accent when color props are omitted. */
  role?: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resolveStatus(
  peaks: Float32Array | null,
  status: WaveformStatus | undefined,
): WaveformStatus {
  if (status) return status;
  if (!peaks || peaks.length === 0) return "empty";
  return "ready";
}

function syncWaveformAria(
  canvas: HTMLCanvasElement,
  progress: number,
  duration: number,
): void {
  canvas.setAttribute("aria-valuenow", String(Number.isFinite(progress) ? progress : 0));
  canvas.setAttribute(
    "aria-valuetext",
    `${formatTime(progress)} / ${formatTime(duration)}`,
  );
}

export function Waveform({
  peaks,
  progress,
  duration,
  height = 48,
  onSeek,
  label,
  ariaLabel,
  muted,
  status: statusProp,
  color,
  playedColor,
  role,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layersRef = useRef<WaveformLayerBitmap | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const status = resolveStatus(peaks, statusProp);
  const canSeek = Boolean(onSeek) && duration > 0 && status === "ready";

  const paint = (seconds: number) => {
    const canvas = canvasRef.current;
    const layers = layersRef.current;
    if (!canvas || !layers) return;
    paintWaveformProgress(canvas, layers, seconds, duration);
    syncWaveformAria(canvas, seconds, duration);
    progressRef.current = seconds;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clearCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 300;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const backdrop = readCanvasBackdrop(canvas);
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, width, height);
      layersRef.current = null;
    };

    if (status !== "ready" || !peaks || peaks.length === 0) {
      clearCanvas();
      syncWaveformAria(canvas, progressRef.current, duration);
      return;
    }

    const colors = muted
      ? resolveMutedDrawColors()
      : resolveDrawColors(canvas, { color, playedColor, role });
    const backdrop = readCanvasBackdrop(canvas);
    const layers = buildWaveformLayers(canvas, peaks, height, colors, backdrop);
    layersRef.current = layers;
    if (layers) {
      paint(progressRef.current);
    }

    const ro = new ResizeObserver(() => {
      const next = buildWaveformLayers(
        canvas,
        peaks,
        height,
        colors,
        readCanvasBackdrop(canvas),
      );
      layersRef.current = next;
      if (next) paint(progressRef.current);
    });
    ro.observe(canvas);

    return () => ro.disconnect();
  }, [peaks, duration, height, muted, status, color, playedColor, role]);

  useEffect(() => {
    paint(progress);
  }, [progress, duration]);

  useEffect(() => {
    return subscribePlaybackPosition((seconds) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (layersRef.current) {
        paint(seconds);
      } else {
        syncWaveformAria(canvas, seconds, duration);
        progressRef.current = seconds;
      }
    });
  }, [duration]);

  function seekToRatio(ratio: number) {
    if (!onSeek || duration <= 0) return;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  }

  function handleClick(e: MouseEvent<HTMLCanvasElement>) {
    if (!canSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekToRatio((e.clientX - rect.left) / rect.width);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    if (!canSeek || !onSeek) return;
    const small = Math.max(0.25, duration * 0.01);
    const large = Math.max(1, duration * 0.05);
    const current = progressRef.current;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = current - small;
        break;
      case "ArrowRight":
        next = current + small;
        break;
      case "ArrowDown":
        next = current - large;
        break;
      case "ArrowUp":
        next = current + large;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = duration;
        break;
      default:
        return;
    }
    e.preventDefault();
    onSeek(Math.max(0, Math.min(duration, next)));
  }

  const accessibleName = ariaLabel ?? label ?? t("waveform.label");
  const valueText = `${formatTime(progress)} / ${formatTime(duration)}`;
  const statusMessage =
    status === "loading"
      ? t("waveform.loading")
      : status === "empty"
        ? t("waveform.empty")
        : null;

  return (
    <div
      className={`waveform ${muted ? "muted" : ""} ${status !== "ready" ? `waveform-${status}` : ""}`}
    >
      {label && <span className="waveform-label">{label}</span>}
      <div className="waveform-frame" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="waveform-canvas"
          style={{ height }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="slider"
          tabIndex={canSeek ? 0 : -1}
          aria-label={accessibleName}
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={Number.isFinite(progress) ? progress : 0}
          aria-valuetext={valueText}
          aria-disabled={!canSeek}
          data-peak-count={
            status === "ready" && peaks && peaks.length > 0 ? peaks.length : undefined
          }
        />
        {statusMessage && (
          <span className="waveform-status" aria-live="polite">
            {statusMessage}
          </span>
        )}
        {muted && status === "ready" && (
          <span className="waveform-muted-tag" aria-hidden>
            {t("waveform.mutedTag")}
          </span>
        )}
      </div>
    </div>
  );
}
