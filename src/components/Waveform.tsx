import { useEffect, useRef, type MouseEvent } from "react";

type Props = {
  peaks: Float32Array | null;
  progress: number;
  duration: number;
  height?: number;
  onSeek?: (seconds: number) => void;
  label?: string;
  muted?: boolean;
};

export function Waveform({
  peaks,
  progress,
  duration,
  height = 48,
  onSeek,
  label,
  muted,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    if (!peaks || peaks.length === 0) return;

    const mid = height / 2;
    const barW = width / peaks.length;
    const playedRatio =
      duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
    const playedX = playedRatio * width;

    ctx.fillStyle = muted ? "rgba(120,120,130,0.35)" : "rgba(196,92,38,0.35)";
    for (let i = 0; i < peaks.length; i++) {
      const amp = Math.max(1, peaks[i]! * mid * 0.92);
      const x = i * barW;
      ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
    }

    ctx.fillStyle = muted ? "rgba(160,160,170,0.75)" : "rgba(232,140,80,0.9)";
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      if (x > playedX) break;
      const amp = Math.max(1, peaks[i]! * mid * 0.92);
      ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playedX + 0.5, 0);
    ctx.lineTo(playedX + 0.5, height);
    ctx.stroke();
  }, [peaks, progress, duration, height, muted]);

  function handleClick(e: MouseEvent<HTMLCanvasElement>) {
    if (!onSeek || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  }

  return (
    <div className={`waveform ${muted ? "muted" : ""}`}>
      {label && <span className="waveform-label">{label}</span>}
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        style={{ height }}
        onClick={handleClick}
        role="slider"
        aria-label={label ?? "Forme d’onde"}
        aria-valuemin={0}
        aria-valuemax={duration || 0}
        aria-valuenow={progress}
      />
    </div>
  );
}
