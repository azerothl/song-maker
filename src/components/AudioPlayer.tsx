import { useEffect, useRef, useState } from "react";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { MixPlaybackEngine, type PlaybackSnapshot } from "../lib/playback";
import { subscribeProduction } from "../lib/productionState";
import { t } from "../ui/i18n";
import { Waveform } from "./Waveform";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type PlaybackView = {
  current: number;
  duration: number;
  mode: PlaybackSnapshot["mode"];
  peaksByTrack: Record<string, Float32Array>;
  seek: (seconds: number) => void;
  loading: boolean;
  ready: boolean;
};

type Props = {
  projectId: string;
  sources: PlaybackSources | null;
  mix: MixDoc | null;
  onError?: (message: string) => void;
  onPlaybackChange?: (view: PlaybackView | null) => void;
};

const emptySnap: PlaybackSnapshot = {
  current: 0,
  duration: 0,
  playing: false,
  ready: false,
  loading: false,
  label: "",
  mode: "empty",
  peaks: [],
  mixPeaks: null,
  productionBake: false,
};

function sourcesKey(sources: PlaybackSources | null): string {
  if (!sources) return "";
  return `${sources.mode}|${sources.generationWav ?? ""}|${sources.stems
    .map((s) => `${s.trackId}:${s.path}`)
    .join(";")}`;
}

export function AudioPlayer({
  projectId,
  sources,
  mix,
  onError,
  onPlaybackChange,
}: Props) {
  const engineRef = useRef<MixPlaybackEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MixPlaybackEngine();
  }
  const engine = engineRef.current;
  const [snap, setSnap] = useState<PlaybackSnapshot>(emptySnap);
  const key = sourcesKey(sources);
  const mixRef = useRef(mix);
  mixRef.current = mix;
  const onPlaybackChangeRef = useRef(onPlaybackChange);
  onPlaybackChangeRef.current = onPlaybackChange;

  useEffect(() => {
    return engine.subscribe(() => {
      const next = engine.getSnapshot();
      setSnap(next);
      const peaksByTrack: Record<string, Float32Array> = {};
      for (const tp of next.peaks) {
        peaksByTrack[tp.trackId] = tp.peaks;
      }
      onPlaybackChangeRef.current?.({
        current: next.current,
        duration: next.duration,
        mode: next.mode,
        peaksByTrack,
        seek: (seconds: number) => engine.seek(seconds),
        loading: next.loading,
        ready: next.ready,
      });
    });
  }, [engine]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await engine.load(sources, mixRef.current);
      } catch (e) {
        if (!cancelled) onError?.(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, key, projectId, sources, onError]);

  useEffect(() => {
    engine.applyMix(mix);
  }, [engine, mix]);

  useEffect(() => {
    return subscribeProduction(() => {
      engine.scheduleProductionBake(mixRef.current);
    });
  }, [engine]);

  useEffect(() => {
    return () => {
      onPlaybackChangeRef.current?.(null);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      e.preventDefault();
      void engine.toggle().catch((err) => onError?.(String(err)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, onError]);

  const showMixWave = snap.mode === "stems";
  const showStereoWave = snap.mode === "generation";
  const mainWaveStatus =
    snap.loading || !snap.ready
      ? "loading"
      : snap.mixPeaks && snap.mixPeaks.length > 0
        ? "ready"
        : "empty";

  return (
    <div className="player-block">
      {(showMixWave || showStereoWave) && (
        <Waveform
          peaks={snap.mixPeaks}
          progress={snap.current}
          duration={snap.duration}
          height={56}
          label={
            snap.mode === "stems"
              ? t("player.mixWave")
              : t("player.stereoWave")
          }
          status={mainWaveStatus}
          onSeek={(s) => engine.seek(s)}
        />
      )}

      <div className="player">
        <button
          type="button"
          className="btn"
          onClick={() =>
            void engine.toggle().catch((err) => onError?.(String(err)))
          }
          disabled={!snap.ready || snap.loading}
        >
          {snap.loading
            ? "…"
            : snap.playing
              ? t("player.pause")
              : t("player.play")}
        </button>
        <div className="player-times" aria-label={t("player.seek")}>
          <span className="player-time">{formatTime(snap.current)}</span>
          <span className="player-time-sep">/</span>
          <span className="player-time">{formatTime(snap.duration)}</span>
        </div>
        <span className="path" title={snap.label}>
          {snap.label || t("library.dash")}
        </span>
      </div>
    </div>
  );
}
