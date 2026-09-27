"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import styles from "./DemoMixer.module.css";

const LAYERS = [
  { id: "piano", file: "piano-roll-sketch.wav", color: "piano" },
  { id: "rhythm", file: "stem-bed-demo.wav", color: "rhythm" },
  { id: "pad", file: "ambient-cot-demo.wav", color: "pad" },
  { id: "loop", file: "mix-clip-loop.wav", color: "loop" },
] as const;

type MixerState = { values: number[]; muted: boolean[]; solo: number | null };

export function DemoMixer() {
  const t = useTranslations("landing.mixer");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [mixer, setMixer] = useState<MixerState>({
    values: [72, 58, 48, 38],
    muted: [false, false, false, false],
    solo: null,
  });
  const contextRef = useRef<AudioContext | null>(null);
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
    try {
      if (contextRef.current?.state === "running") {
        await contextRef.current.suspend();
        setPlaying(false);
        return;
      }

      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (!buffersRef.current) {
        buffersRef.current = await Promise.all(LAYERS.map(async ({ file }) => {
          const response = await fetch(`/examples/${file}`);
          if (!response.ok) throw new Error("demo audio unavailable");
          return context.decodeAudioData(await response.arrayBuffer());
        }));
      }

      if (!sourcesRef.current.length) {
        gainsRef.current = LAYERS.map((_, index) => {
          const gain = context.createGain();
          const soloAllows = mixer.solo === null || mixer.solo === index;
          gain.gain.value = mixer.muted[index] || !soloAllows ? 0 : mixer.values[index] / 100;
          return gain;
        });
        gainsRef.current.forEach((gain) => gain.connect(context.destination));
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
    }
  }

  function setLayer(update: Partial<Pick<MixerState, "values" | "muted" | "solo">>) {
    setMixer((current) => ({ ...current, ...update }));
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
        <button className={styles.playButton} type="button" onClick={togglePlayback} aria-label={playing ? t("pause") : t("play")}>
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        </button>
        <div className={styles.trackInfo}>
          <strong>{t("trackName")}</strong>
          <span aria-live="polite">{playing ? t("playing") : t("ready")}</span>
        </div>
        <div className={`${styles.masterWave} ${playing ? styles.isPlaying : ""}`} aria-hidden="true">
          {Array.from({ length: 48 }, (_, index) => <i key={index} style={{ "--bar": `${16 + ((index * 37 + index * index * 13) % 76)}%`, "--i": index } as CSSProperties} />)}
        </div>
        <span className={styles.duration} aria-label={t("loop")}>∞ LOOP</span>
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
                {Array.from({ length: 34 }, (_, bar) => <i key={bar} style={{ "--bar": `${12 + ((bar * (index + 9) * 17 + bar * bar * 3) % 82)}%`, "--i": bar } as CSSProperties} />)}
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
        <button className={styles.reset} type="button" onClick={() => setMixer({ values: [72, 58, 48, 38], muted: [false, false, false, false], solo: null })}>{t("reset")}</button>
      </div>
    </section>
  );
}
