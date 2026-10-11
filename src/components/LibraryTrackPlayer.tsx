import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../ui/i18n";
import { useAppStore } from "../store/appStore";
import { Waveform } from "./Waveform";

type WaveformData = { peaks: Float32Array; duration: number };
const waveformCache = new Map<string, WaveformData>();
const waveformJobs = new Map<string, Promise<WaveformData>>();
let waveformQueue: Promise<void> = Promise.resolve();

function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 350 });
    } else {
      window.setTimeout(resolve, 30);
    }
  });
}

async function readPeaks(projectId: string, generationId: string): Promise<WaveformData> {
  const key = `${projectId}:${generationId}`;
  const cached = waveformCache.get(key);
  if (cached) return cached;
  const existing = waveformJobs.get(key);
  if (existing) return existing;

  const job = waveformQueue.then(async () => {
    await waitForIdle();
    const result = await api.generationWaveform(projectId, generationId);
    const waveform = { peaks: Float32Array.from(result.peaks), duration: result.duration };
    waveformCache.set(key, waveform);
    return waveform;
  });
  waveformQueue = job.then(() => undefined, () => undefined);
  waveformJobs.set(key, job);
  try {
    return await job;
  } finally {
    waveformJobs.delete(key);
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

/** A library preview with immediately usable audio controls and a non-blocking waveform. */
export function LibraryTrackPlayer({
  audioPath,
  label,
  projectId,
  generationId,
  trackKey,
  color,
  playedColor,
  onPlay,
}: {
  audioPath: string;
  label: string;
  projectId: string;
  generationId: string;
  trackKey: string;
  color?: string;
  playedColor?: string;
  onPlay?: () => void;
}) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const [waveformDuration, setWaveformDuration] = useState(0);
  const [waveformVisible, setWaveformVisible] = useState(false);
  const playerSelection = useAppStore((s) => s.playerSelection);
  const setPlayerSelection = useAppStore((s) => s.setPlayerSelection);
  const playback = useAppStore((s) => s.playback);
  const pendingPlayRef = useRef(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const selected = playerSelection?.trackKey === trackKey;
  const current = selected ? playback?.current ?? 0 : 0;
  const duration = selected && playback?.duration ? playback.duration : waveformDuration;
  const playing = selected && Boolean(playback?.playing);

  useEffect(() => {
    const element = waveformRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setWaveformVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setWaveformVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveformFailed(false);
    setWaveformDuration(0);
    if (!waveformVisible) return;
    void (async () => {
      try {
        const next = await readPeaks(projectId, generationId);
        if (!cancelled) {
          setPeaks(next.peaks);
          setWaveformDuration(next.duration);
        }
      } catch {
        if (!cancelled) setWaveformFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generationId, projectId, waveformVisible]);

  useEffect(() => {
    if (!pendingPlayRef.current || !selected || !playback?.ready || playback.sourceKey !== trackKey) return;
    pendingPlayRef.current = false;
    onPlay?.();
    void playback.toggle();
  }, [onPlay, playback, selected, trackKey]);

  const toggle = () => {
    if (selected && playback?.ready && playback.sourceKey === trackKey) {
      if (!playback.playing) onPlay?.();
      void playback.toggle();
      return;
    }
    pendingPlayRef.current = true;
    setPlayerSelection({
      trackKey,
      projectId,
      sources: { mode: "generation", generationWav: audioPath, stems: [], label },
    });
  };

  return (
    <div className="library-track-player">
      <button
        type="button"
        className="library-track-play"
        onClick={toggle}
        aria-label={`${playing ? t("player.pause") : t("player.play")} — ${label}`}
        title={playing ? t("player.pause") : t("player.play")}
      >
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
      </button>
      <span className="library-track-time" aria-label={t("player.seek")}>
        {formatTime(current)} / {formatTime(duration)}
      </span>
      <div className="library-track-waveform" ref={waveformRef}>
        <Waveform
          peaks={peaks}
          progress={current}
          duration={duration}
          height={44}
          ariaLabel={`${t("player.stereoWave")} — ${label}`}
          status={peaks ? "ready" : waveformFailed ? "empty" : "loading"}
          color={color}
          playedColor={playedColor}
          onSeek={(seconds) => {
            if (selected && playback?.ready && playback.sourceKey === trackKey) {
              playback.seek(seconds);
            } else {
              setPlayerSelection({
                trackKey,
                projectId,
                sources: { mode: "generation", generationWav: audioPath, stems: [], label },
              });
            }
          }}
        />
      </div>
      {!peaks && !waveformFailed && <span className="sr-only" role="status">{t("library.waveformPreparing")}</span>}
      {waveformFailed && <span className="sr-only">{t("library.waveformUnavailable")}</span>}
    </div>
  );
}
