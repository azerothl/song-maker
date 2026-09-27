"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import styles from "./DemoMixer.module.css";

const LAYERS = [
  { id: "vocals", file: "vocals.mp3", color: "vocals", waveform: [0.358,0.515,0.433,0.501,0.157,0.04,0.04,0.04,0.414,0.898,0.832,0.68,0.802,0.853,0.811,0.3,0.851,0.599,0.604,0.838,0.835,0.891,0.681,0.599,0.706,0.721,0.76,0.752,0.045,0.148,0.767,0.649,0.877,1,0.996,0.936] },
  { id: "drums", file: "drums.mp3", color: "drums", waveform: [0.565,0.54,0.648,0.581,0.674,0.752,1,0.997,0.04,0.04,0.04,0.409,0.543,0.186,0.04,0.419,0.425,0.04,0.386,0.402,0.396,0.04,0.39,0.378,0.463,0.716,0.385,0.424,0.04,0.349,0.424,0.204,0.04,0.514,0.401,0.044] },
  { id: "bass", file: "bass.mp3", color: "bass", waveform: [0.608,0.594,0.533,0.559,0.562,0.53,0.233,0.204,0.523,0.04,0.04,0.475,0.674,0.767,0.838,0.744,0.702,0.887,0.769,0.739,0.684,0.758,0.659,0.719,0.668,0.461,0.651,0.692,1,0.927,0.673,0.814,0.796,0.596,0.685,0.769] },
  { id: "other", file: "other.mp3", color: "other", waveform: [0.2,0.341,0.458,0.155,0.091,0.04,0.042,0.04,0.04,0.04,0.04,0.04,0.098,0.151,0.304,0.3,0.239,0.147,0.04,0.04,0.129,0.097,0.04,0.04,0.04,0.04,0.04,0.102,0.227,0.378,0.04,0.288,0.155,0.165,0.325,1] },
  { id: "guitar", file: "guitar.mp3", color: "guitar", waveform: [0.346,0.375,0.382,0.268,0.594,0.702,0.853,1,0.497,0.04,0.04,0.352,0.831,0.806,0.847,0.896,0.616,0.752,0.658,0.769,0.736,0.668,0.766,0.722,0.627,0.647,0.573,0.441,0.86,0.815,0.447,0.476,0.296,0.468,0.48,0.349] },
  { id: "piano", file: "piano.mp3", color: "piano", waveform: [0.351,0.323,0.364,0.326,0.303,0.276,0.4,0.373,0.162,0.118,0.135,0.424,0.303,0.33,0.422,0.416,0.451,0.486,1,0.311,0.349,0.252,0.289,0.358,0.374,0.448,0.291,0.438,0.273,0.355,0.302,0.361,0.291,0.36,0.429,0.341] },
] as const;

const INITIAL_VALUES = [76, 67, 68, 54, 48, 42];
const MIX_WAVEFORM = LAYERS[0].waveform.map((_, index) =>
  Math.max(...LAYERS.map((layer) => layer.waveform[index])),
);

type MixerState = { values: number[]; muted: boolean[]; solo: number | null };

export function DemoMixer() {
  const t = useTranslations("landing.mixer");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [mixer, setMixer] = useState<MixerState>({
    values: INITIAL_VALUES,
    muted: LAYERS.map(() => false),
    solo: null,
  });
  const contextRef = useRef<AudioContext | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const gainsRef = useRef<GainNode[]>([]);
  const buffersRef = useRef<AudioBuffer[] | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => () => {
    sourcesRef.current.forEach((source) => source.stop());
    void contextRef.current?.close();
  }, []);

  useEffect(() => {
    gainsRef.current.forEach((gain, index) => {
      const soloAllows = mixer.solo === null || mixer.solo === index;
      gain.gain.setTargetAtTime(
        mixer.muted[index] || !soloAllows ? 0 : mixer.values[index] / 100,
        gain.context.currentTime,
        0.025,
      );
    });
  }, [mixer]);

  async function togglePlayback() {
    setError(false);
    if (contextRef.current?.state === "running") {
      await contextRef.current.suspend();
      setPlaying(false);
      return;
    }

    setLoading(true);
    try {
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (!buffersRef.current) {
        buffersRef.current = await Promise.all(LAYERS.map(async ({ file }) => {
          const response = await fetch(`/examples/real-generation-6/${file}`);
          if (!response.ok) throw new Error("real generation sample unavailable");
          return context.decodeAudioData(await response.arrayBuffer());
        }));
      }

      if (!compressorRef.current) {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 14;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.2;
        compressor.connect(context.destination);
        compressorRef.current = compressor;
      }

      if (!sourcesRef.current.length) {
        gainsRef.current = LAYERS.map((_, index) => {
          const gain = context.createGain();
          const soloAllows = mixer.solo === null || mixer.solo === index;
          gain.gain.value = mixer.muted[index] || !soloAllows ? 0 : mixer.values[index] / 100;
          gain.connect(compressorRef.current!);
          return gain;
        });
        sourcesRef.current = (buffersRef.current ?? []).map((buffer, index) => {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(gainsRef.current[index]);
          source.start();
          return source;
        });
      }

      await context.resume();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function setLayer(update: Partial<Pick<MixerState, "values" | "muted" | "solo">>) {
    setMixer((current) => ({ ...current, ...update }));
  }

  function resetMixer() {
    setMixer({ values: [...INITIAL_VALUES], muted: LAYERS.map(() => false), solo: null });
  }

  return (
    <section className={styles.mixer} id="mixer" aria-label={t("ariaLabel")}>
      <div className={styles.topline}>
        <div>
          <span className={styles.kicker}>{t("kicker")}</span>
          <h2>{t("title")}</h2>
        </div>
        <span className={styles.demoTag}><i aria-hidden="true" />{t("badge")}</span>
      </div>

      <div className={styles.transport}>
        <button className={styles.playButton} type="button" onClick={togglePlayback} disabled={loading} aria-label={loading ? t("loading") : playing ? t("pause") : t("play")} aria-busy={loading}>
          <span aria-hidden="true">{loading ? "…" : playing ? "Ⅱ" : "▶"}</span>
        </button>
        <div className={styles.trackInfo}>
          <strong>{t("trackName")}</strong>
          <span aria-live="polite">{loading ? t("loading") : playing ? t("playing") : t("ready")}</span>
        </div>
        <div className={`${styles.masterWave} ${playing ? styles.isPlaying : ""}`} aria-hidden="true">
          {MIX_WAVEFORM.map((level, index) => <i key={index} style={{ "--bar": `${level * 100}%`, "--i": index } as CSSProperties} />)}
        </div>
        <span className={styles.duration} aria-label={t("loop")}>00:20</span>
      </div>

      <div className={styles.layerList}>
        {LAYERS.map((layer, index) => {
          const active = mixer.solo === null || mixer.solo === index;
          return (
            <div className={`${styles.layer} ${!active || mixer.muted[index] ? styles.quiet : ""}`} key={layer.id}>
              <div className={styles.layerName}>
                <span className={`${styles.colorMark} ${styles[layer.color]}`} aria-hidden="true" />
                <span>{t(`layers.${layer.id}`)}</span>
              </div>
              <div className={`${styles.miniWave} ${styles[layer.color]} ${playing && active && !mixer.muted[index] ? styles.isPlaying : ""}`} aria-hidden="true">
                {layer.waveform.map((level, bar) => <i key={bar} style={{ "--bar": `${level * 100}%`, "--i": bar } as CSSProperties} />)}
              </div>
              <label className={styles.volume}>
                <span className={styles.srOnly}>{t("volume", { layer: t(`layers.${layer.id}`) })}</span>
                <input type="range" min="0" max="100" value={mixer.values[index]} onChange={(event) => setLayer({ values: mixer.values.map((value, i) => i === index ? Number(event.target.value) : value) })} />
              </label>
              <output className={styles.level}>{mixer.values[index]}</output>
              <button className={`${styles.smallButton} ${mixer.muted[index] ? styles.selected : ""}`} type="button" aria-pressed={mixer.muted[index]} aria-label={t("mute", { layer: t(`layers.${layer.id}`) })} onClick={() => setLayer({ muted: mixer.muted.map((value, i) => i === index ? !value : value) })}>M</button>
              <button className={`${styles.smallButton} ${mixer.solo === index ? styles.selected : ""}`} type="button" aria-pressed={mixer.solo === index} aria-label={t("solo", { layer: t(`layers.${layer.id}`) })} onClick={() => setLayer({ solo: mixer.solo === index ? null : index })}>S</button>
            </div>
          );
        })}
      </div>

      <div className={styles.mixerFooter}>
        <p>{error ? t("error") : t("disclaimer")}</p>
        <button className={styles.reset} type="button" onClick={resetMixer}>{t("reset")}</button>
      </div>
    </section>
  );
}
