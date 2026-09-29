import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  DEFAULT_WAVE_COLOR,
  resolveWaveFillColors,
  roleWaveColor,
  WAVE_PLAYHEAD_OUTLINE,
  WAVE_PLAYHEAD_STROKE,
} from "../lib/trackRoleColors";
import { t } from "../ui/i18n";

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

function readCssWaveColors(el: Element | null): {
  wave: string | null;
  played: string | null;
} {
  if (!el) return { wave: null, played: null };
  const style = getComputedStyle(el);
  const wave = style.getPropertyValue("--track-wave").trim();
  const played = style.getPropertyValue("--track-wave-played").trim();
  return {
    wave: wave || null,
    played: played || null,
  };
}

function resolveDrawColors(
  el: Element | null,
  opts: { color?: string; playedColor?: string; role?: string },
): { unplayed: string; played: string } {
  // Prefer inherited `--track-wave` so pastille + waveform share one CSS source (#159).
  const css = readCssWaveColors(el);
  if (opts.color || opts.playedColor) {
    const base = opts.color ?? css.wave ?? roleWaveColor(opts.role);
    const fills = resolveWaveFillColors(base);
    if (opts.playedColor) {
      return { unplayed: fills.unplayed, played: opts.playedColor };
    }
    return fills;
  }
  if (css.wave) {
    const fills = resolveWaveFillColors(css.wave);
    if (css.played && css.played !== css.wave) {
      return { unplayed: fills.unplayed, played: css.played };
    }
    return fills;
  }
  if (opts.role) {
    return resolveWaveFillColors(roleWaveColor(opts.role));
  }
  return resolveWaveFillColors(DEFAULT_WAVE_COLOR);
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
  const status = resolveStatus(peaks, statusProp);
  const canSeek = Boolean(onSeek) && duration > 0 && status === "ready";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 300;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (status !== "ready" || !peaks || peaks.length === 0) return;

    const mid = height / 2;
    const barW = width / peaks.length;
    const playedRatio =
      duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
    const playedX = playedRatio * width;

    const colors = muted
      ? {
          unplayed: "rgba(120,120,130,0.35)",
          played: "rgba(160,160,170,0.75)",
        }
      : resolveDrawColors(canvas, { color, playedColor, role });

    ctx.fillStyle = colors.unplayed;
    for (let i = 0; i < peaks.length; i++) {
      const amp = Math.max(1, peaks[i]! * mid * 0.92);
      const x = i * barW;
      ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
    }

    ctx.fillStyle = colors.played;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      if (x > playedX) break;
      const amp = Math.max(1, peaks[i]! * mid * 0.92);
      ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
    }

    // Outline + white stroke: playhead must not rely on color alone (#159).
    const playheadX = playedX + 0.5;
    ctx.strokeStyle = WAVE_PLAYHEAD_OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.strokeStyle = WAVE_PLAYHEAD_STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [peaks, progress, duration, height, muted, status, color, playedColor, role]);

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
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = progress - small;
        break;
      case "ArrowRight":
        next = progress + small;
        break;
      case "ArrowDown":
        next = progress - large;
        break;
      case "ArrowUp":
        next = progress + large;
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
