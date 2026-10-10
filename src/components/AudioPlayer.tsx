import { useEffect, useRef, useState } from "react";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { MixPlaybackEngine, type PlaybackSnapshot } from "../lib/playback";
import { subscribeProduction } from "../lib/productionState";
import { t } from "../ui/i18n";
import { MixBakeStatusIndicator } from "./MixBakeStatusIndicator";
import { PlaybackTime } from "./PlaybackTime";
import { Waveform } from "./Waveform";
import { TAKE_PREVIEW_PLAY_EVENT } from "./TakePreviewPlayer";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type PlaybackView = {
  sourceKey?: string;
  current: number;
  /** Fresh transport values for capture/scheduling code outside React render cadence. */
  readTransport?: () => { current: number; playing: boolean; ready: boolean };
  duration: number;
  mode: PlaybackSnapshot["mode"];
  peaksByTrack: Record<string, Float32Array>;
  mixPeaks: Float32Array | null;
  seek: (seconds: number) => void;
  toggle: () => Promise<void>;
  playing: boolean;
  loading: boolean;
  ready: boolean;
  mixBakePending: boolean;
  mixBakeFailed: boolean;
};

type Props = {
  projectId?: string;
  sources: PlaybackSources | null;
  mix: MixDoc | null;
  /** Vue split : le master porte lecture et temps (#132). */
  delegateTransport?: boolean;
  /** Onglet Production : indicateur porté par ProductionWorkspace. */
  hideMixBakeStatus?: boolean;
  playbackKey?: string;
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
  productionMixBakePending: false,
  productionMixBakeFailed: false,
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
  delegateTransport = false,
  hideMixBakeStatus = false,
  playbackKey,
  onError,
  onPlaybackChange,
}: Props) {
  const engineRef = useRef<MixPlaybackEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MixPlaybackEngine();
  }
  const engine = engineRef.current;
  async function togglePlayback() {
    if (!engine.getSnapshot().playing) {
      window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: engine }));
    }
    await engine.toggle();
  }
  const [snap, setSnap] = useState<PlaybackSnapshot>(emptySnap);
  const hasAudioSource = Boolean(sources?.generationWav || sources?.stems?.length);
  const effectiveSources = hasAudioSource ? sources : null;
  const key = sourcesKey(effectiveSources);
  const sourcesRef = useRef(effectiveSources);
  sourcesRef.current = effectiveSources;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const mixRef = useRef(mix);
  mixRef.current = mix;
  const onPlaybackChangeRef = useRef(onPlaybackChange);
  onPlaybackChangeRef.current = onPlaybackChange;
  const playbackKeyRef = useRef(playbackKey ?? projectId);
  playbackKeyRef.current = playbackKey ?? projectId;

  useEffect(() => {
    const stopForPreview = (event: Event) => {
      if ((event as CustomEvent).detail !== engine) engine.pause();
    };
    window.addEventListener(TAKE_PREVIEW_PLAY_EVENT, stopForPreview);
    return () => window.removeEventListener(TAKE_PREVIEW_PLAY_EVENT, stopForPreview);
  }, [engine]);

  useEffect(() => {
    return engine.subscribe(() => {
      const next = engine.getSnapshot();
      setSnap(next);
      const peaksByTrack: Record<string, Float32Array> = {};
      for (const tp of next.peaks) {
        peaksByTrack[tp.trackId] = tp.peaks;
      }
      onPlaybackChangeRef.current?.({
        sourceKey: playbackKeyRef.current,
        current: next.current,
        readTransport: () => {
          const live = engine.getSnapshot();
          return {
            current: engine.getCurrentTime(),
            playing: live.playing,
            ready: live.ready,
          };
        },
        duration: next.duration,
        mode: next.mode,
        peaksByTrack,
        mixPeaks: next.mixPeaks,
        seek: (seconds: number) => engine.seek(seconds),
        toggle: togglePlayback,
        playing: next.playing,
        loading: next.loading,
        ready: next.ready,
        mixBakePending: next.productionMixBakePending,
        mixBakeFailed: next.productionMixBakeFailed,
      });
    });
  }, [engine]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await engine.load(sourcesRef.current, mixRef.current);
      } catch (e) {
        if (!cancelled) onErrorRef.current?.(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, key, projectId]);

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
      void togglePlayback().catch((err) => onError?.(String(err)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, onError]);

  const showMixWave = snap.mode === "stems" && !delegateTransport;
  const showStereoWave = snap.mode === "generation";
  const mainWaveStatus =
    snap.loading || !snap.ready
      ? "loading"
      : snap.mixPeaks && snap.mixPeaks.length > 0
        ? "ready"
        : "empty";

  return (
    <div
      className={
        delegateTransport
          ? "player-block player-block-delegated"
          : "player-block"
      }
    >
      {!delegateTransport && !hideMixBakeStatus && (
        <MixBakeStatusIndicator
          pending={snap.productionMixBakePending}
          failed={snap.productionMixBakeFailed}
        />
      )}

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

      {!delegateTransport && !hasAudioSource && (
        <div className="player-empty-wave" aria-live="polite">
          {t("player.emptyHint")}
        </div>
      )}

      {!delegateTransport && (
        <div className="player">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void togglePlayback().catch((err) => onError?.(String(err)))
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
            <PlaybackTime seconds={snap.current} className="player-time" />
            <span className="player-time-sep">/</span>
            <span className="player-time">{formatTime(Math.round(snap.duration))}</span>
          </div>
          <span className="path" title={snap.label}>
            {snap.label || t("player.emptyTitle")}
          </span>
        </div>
      )}
    </div>
  );
}
