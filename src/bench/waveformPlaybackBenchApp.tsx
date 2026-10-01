import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Waveform } from "../components/Waveform";
import {
  readCanvasBackdrop,
  resolveDrawColors,
} from "../components/waveformDraw";
import {
  WAVE_PLAYHEAD_OUTLINE,
  WAVE_PLAYHEAD_STROKE,
} from "../lib/trackRoleColors";
import { emitPlaybackPosition } from "../lib/playbackPosition";
import { syntheticPeaks } from "../dev/captureDemoMix";
import "../App.css";

export type WaveformBenchScenario = {
  trackCount: 12 | 16;
  durationSec: number;
  frames: number;
};

export type WaveformBenchResult = {
  scenario: WaveformBenchScenario;
  mode: "legacy-react" | "optimized-bus";
  canvasCount: number;
  framesObserved: number;
  fillRectCalls: number;
  fillRectPerFrame: number;
  longTasksMs: number;
  longTaskCount: number;
  meanFrameMs: number;
  p95FrameMs: number;
};

function installFillRectCounter(): () => number {
  let count = 0;
  const proto = CanvasRenderingContext2D.prototype;
  const original = proto.fillRect;
  proto.fillRect = function (...args) {
    count += 1;
    return original.apply(this, args);
  };
  return () => {
    proto.fillRect = original;
    return count;
  };
}

/** Copie du chemin pré-#232 : `useEffect` sur `progress` + 2 boucles peaks. */
function LegacyWaveform({
  peaks,
  progress,
  duration,
  height = 48,
}: {
  peaks: Float32Array;
  progress: number;
  duration: number;
  height?: number;
}) {
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
    const backdrop = readCanvasBackdrop(canvas);
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    const colors = resolveDrawColors(canvas, { role: "vocals" });
    const mid = height / 2;
    const barW = width / peaks.length;
    const playedRatio =
      duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
    const playedX = playedRatio * width;
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
  }, [peaks, progress, duration, height]);

  return (
    <div className="waveform">
      <div className="waveform-frame" style={{ height }}>
        <canvas ref={canvasRef} className="waveform-canvas" style={{ height }} />
      </div>
    </div>
  );
}

function LegacyWaveformGrid({
  trackCount,
  progress,
  duration,
}: {
  trackCount: number;
  progress: number;
  duration: number;
}) {
  const peaks = useRef(syntheticPeaks(42, 600));
  return (
    <>
      {Array.from({ length: trackCount }, (_, i) => (
        <LegacyWaveform
          key={i}
          peaks={peaks.current}
          progress={progress}
          duration={duration}
          height={48}
        />
      ))}
    </>
  );
}

/** Reproduit l’ancien `useEffect` (2 boucles peaks × progress) sans React. */
function legacyFullRedrawFrame(
  canvases: HTMLCanvasElement[],
  peaks: Float32Array,
  progress: number,
  duration: number,
  height: number,
) {
  for (const canvas of canvases) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 300;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const backdrop = readCanvasBackdrop(canvas);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    const colors = resolveDrawColors(canvas, {});
    const mid = height / 2;
    const barW = width / peaks.length;
    const playedRatio =
      duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
    const playedX = playedRatio * width;
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
    const playheadX = playedX + 0.5;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }
}

async function runLegacyReactBench(
  scenario: WaveformBenchScenario,
): Promise<WaveformBenchResult> {
  const mount = document.createElement("div");
  mount.style.width = "640px";
  document.body.appendChild(mount);
  const root = createRoot(mount);

  const stopFillCounter = installFillRectCounter();
  const longTasks: number[] = [];
  const obs =
    typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            longTasks.push(e.duration);
          }
        })
      : null;
  obs?.observe({ entryTypes: ["longtask"] });

  let progress = 0;
  const frameMs: number[] = [];

  const BenchApp = () => {
    const [p, setP] = useState(0);
    useEffect(() => {
      let frame = 0;
      let last = performance.now();
      let raf = 0;
      const tick = () => {
        frame += 1;
        const now = performance.now();
        frameMs.push(now - last);
        last = now;
        progress = (frame / scenario.frames) * scenario.durationSec;
        setP(progress);
        if (frame < scenario.frames) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, []);
    return (
      <LegacyWaveformGrid
        trackCount={scenario.trackCount}
        progress={p}
        duration={scenario.durationSec}
      />
    );
  };

  root.render(<BenchApp />);
  await new Promise((r) => setTimeout(r, scenario.frames * 20 + 200));
  const fillRectCalls = stopFillCounter();
  obs?.disconnect();
  root.unmount();
  mount.remove();

  const sorted = [...frameMs].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const mean = frameMs.reduce((s, v) => s + v, 0) / Math.max(1, frameMs.length);

  return {
    scenario,
    mode: "legacy-react",
    canvasCount: scenario.trackCount,
    framesObserved: frameMs.length,
    fillRectCalls,
    fillRectPerFrame: fillRectCalls / Math.max(1, frameMs.length),
    longTasksMs: longTasks.reduce((s, d) => s + d, 0),
    longTaskCount: longTasks.length,
    meanFrameMs: mean,
    p95FrameMs: p95,
  };
}

async function runOptimizedBusBench(
  scenario: WaveformBenchScenario,
): Promise<WaveformBenchResult> {
  const mount = document.createElement("div");
  mount.style.width = "640px";
  document.body.appendChild(mount);
  const root = createRoot(mount);

  const peaks = syntheticPeaks(42, 600);
  root.render(
    <>
      {Array.from({ length: scenario.trackCount }, (_, i) => (
        <Waveform
          key={i}
          peaks={peaks}
          progress={0}
          duration={scenario.durationSec}
          height={48}
          role="vocals"
        />
      ))}
    </>,
  );
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvases = Array.from(
    mount.querySelectorAll<HTMLCanvasElement>("canvas.waveform-canvas"),
  );

  const stopFillCounter = installFillRectCounter();
  const longTasks: number[] = [];
  const obs =
    typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            longTasks.push(e.duration);
          }
        })
      : null;
  obs?.observe({ entryTypes: ["longtask"] });

  const frameMs: number[] = [];
  let frame = 0;
  let last = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      frame += 1;
      const now = performance.now();
      frameMs.push(now - last);
      last = now;
      const progress = (frame / scenario.frames) * scenario.durationSec;
      emitPlaybackPosition(progress);
      if (frame < scenario.frames) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  const fillRectCalls = stopFillCounter();
  obs?.disconnect();
  root.unmount();
  mount.remove();

  const sorted = [...frameMs].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const mean = frameMs.reduce((s, v) => s + v, 0) / Math.max(1, frameMs.length);

  return {
    scenario,
    mode: "optimized-bus",
    canvasCount: canvases.length,
    framesObserved: frameMs.length,
    fillRectCalls,
    fillRectPerFrame: fillRectCalls / Math.max(1, frameMs.length),
    longTasksMs: longTasks.reduce((s, d) => s + d, 0),
    longTaskCount: longTasks.length,
    meanFrameMs: mean,
    p95FrameMs: p95,
  };
}

/** Micro-banc synchrone (hors React) pour le chemin legacy pur canvas. */
export function benchLegacyCanvasOnly(
  trackCount: number,
  frames: number,
  durationSec: number,
): Pick<
  WaveformBenchResult,
  "fillRectCalls" | "fillRectPerFrame" | "framesObserved"
> {
  const mount = document.createElement("div");
  mount.style.width = "640px";
  document.body.appendChild(mount);
  const peaks = syntheticPeaks(7, 600);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < trackCount; i++) {
    const wrap = document.createElement("div");
    wrap.className = "waveform-frame";
    wrap.style.height = "48px";
    const canvas = document.createElement("canvas");
    canvas.className = "waveform-canvas";
    canvas.style.height = "48px";
    canvas.style.width = "100%";
    wrap.appendChild(canvas);
    mount.appendChild(wrap);
    canvases.push(canvas);
  }
  const stop = installFillRectCounter();
  for (let f = 1; f <= frames; f++) {
    const progress = (f / frames) * durationSec;
    legacyFullRedrawFrame(canvases, peaks, progress, durationSec, 48);
  }
  const fillRectCalls = stop();
  mount.remove();
  return {
    framesObserved: frames,
    fillRectCalls,
    fillRectPerFrame: fillRectCalls / frames,
  };
}

export async function runWaveformPlaybackBench(): Promise<{
  generatedAt: string;
  scenarios: WaveformBenchResult[];
}> {
  const scenarios: WaveformBenchScenario[] = [
    { trackCount: 12, durationSec: 180, frames: 120 },
    { trackCount: 16, durationSec: 180, frames: 120 },
  ];
  const results: WaveformBenchResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runLegacyReactBench(scenario));
    results.push(await runOptimizedBusBench(scenario));
  }
  return { generatedAt: new Date().toISOString(), scenarios: results };
}

declare global {
  interface Window {
    __waveformPlaybackBench?: {
      run: typeof runWaveformPlaybackBench;
      benchLegacyCanvasOnly: typeof benchLegacyCanvasOnly;
    };
  }
}

const rootEl = document.getElementById("bench-root");
if (rootEl) {
  createRoot(rootEl).render(
    <p style={{ fontFamily: "system-ui", padding: 16 }}>
      Harness bench waveforms (#232) — lancer <code>pnpm bench:waveform-playback</code>
    </p>,
  );
}

window.__waveformPlaybackBench = {
  run: runWaveformPlaybackBench,
  benchLegacyCanvasOnly,
};
