import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../ui/i18n";
import { useAppStore } from "../store/appStore";
import { Waveform } from "./Waveform";

type WaveformData = { peaks: Float32Array; duration: number };
const waveformCache = new Map<string, WaveformData>();
const waveformJobs = new Map<string, Promise<WaveformData>>();

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

async function readPeaks(url: string): Promise<WaveformData> {
  const cached = waveformCache.get(url);
  if (cached) return cached;
  const existing = waveformJobs.get(url);
  if (existing) return existing;

  const job = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Waveform source returned ${response.status}`);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(bytes);
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
        decoded.getChannelData(index),
      );
      const peaks = new Float32Array(320);
      for (let start = 0; start < peaks.length; start += 8) {
        const end = Math.min(peaks.length, start + 8);
        for (let bin = start; bin < end; bin += 1) {
          const from = Math.floor((bin / peaks.length) * decoded.length);
          const to = Math.max(from + 1, Math.floor(((bin + 1) / peaks.length) * decoded.length));
          let peak = 0;
          for (const samples of channels) {
            for (let sample = from; sample < Math.min(to, samples.length); sample += 1) {
              peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
            }
          }
          peaks[bin] = peak;
        }
        if (end < peaks.length) await waitForIdle();
      }
      const result = { peaks, duration: decoded.duration };
      waveformCache.set(url, result);
      return result;
    } finally {
      await context.close().catch(() => undefined);
    }
  })();
  waveformJobs.set(url, job);
  try {
    return await job;
  } finally {
    waveformJobs.delete(url);
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
  trackKey,
}: {
  audioPath: string;
  label: string;
  projectId: string;
  trackKey: string;
}) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const [waveformDuration, setWaveformDuration] = useState(0);
  const playerSelection = useAppStore((s) => s.playerSelection);
  const setPlayerSelection = useAppStore((s) => s.setPlayerSelection);
  const playback = useAppStore((s) => s.playback);
  const pendingPlayRef = useRef(false);
  const selected = playerSelection?.trackKey === trackKey;
  const current = selected ? playback?.current ?? 0 : 0;
  const duration = selected && playback?.duration ? playback.duration : waveformDuration;
  const playing = selected && Boolean(playback?.playing);
  const url = useMemo(
    () => (/^(data:|blob:|https?:)/.test(audioPath) ? audioPath : convertFileSrc(audioPath)),
    [audioPath],
  );

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveformFailed(false);
    setWaveformDuration(0);
    void (async () => {
      try {
        await waitForIdle();
        const next = await readPeaks(url);
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
  }, [url]);

  useEffect(() => {
    if (!pendingPlayRef.current || !selected || !playback?.ready || playback.sourceKey !== trackKey) return;
    pendingPlayRef.current = false;
    void playback.toggle();
  }, [playback, selected, trackKey]);

  const toggle = () => {
    if (selected && playback?.ready && playback.sourceKey === trackKey) {
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
      <div className="library-track-waveform">
        <Waveform
          peaks={peaks}
          progress={current}
          duration={duration}
          height={44}
          ariaLabel={`${t("player.stereoWave")} — ${label}`}
          status={peaks ? "ready" : waveformFailed ? "empty" : "loading"}
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
