"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./WaveformPlayer.module.css";

type Props = {
  src: string;
  title: string;
  meta: string;
  badge: string;
  playLabel: string;
  pauseLabel: string;
};

export function WaveformPlayer({
  src,
  title,
  meta,
  badge,
  playLabel,
  pauseLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const peaksRef = useRef<number[] | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const audioCtx = new AudioContext();

    async function loadPeaks() {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(buf.slice(0));
      if (cancelled) return;
      const data = decoded.getChannelData(0);
      const buckets = 96;
      const size = Math.floor(data.length / buckets);
      const peaks: number[] = [];
      for (let i = 0; i < buckets; i++) {
        let max = 0;
        const start = i * size;
        for (let j = 0; j < size; j++) {
          max = Math.max(max, Math.abs(data[start + j] ?? 0));
        }
        peaks.push(max);
      }
      peaksRef.current = peaks;
      draw(0);
    }

    void loadPeaks().catch(() => {
      peaksRef.current = Array.from({ length: 96 }, (_, i) => 0.2 + (i % 5) * 0.08);
      draw(0);
    });

    return () => {
      cancelled = true;
      void audioCtx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      setProgress(p);
      draw(p);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      draw(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(p: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const peaks = peaksRef.current ?? Array.from({ length: 64 }, () => 0.3);
    const gap = w / peaks.length;
    peaks.forEach((peak, i) => {
      const x = i * gap;
      const barH = Math.max(2, peak * h * 0.85);
      const active = i / peaks.length <= p;
      ctx.fillStyle = active
        ? "rgba(232, 165, 75, 0.9)"
        : "rgba(154, 144, 128, 0.45)";
      ctx.fillRect(x + 1, (h - barH) / 2, Math.max(1.5, gap * 0.55), barH);
    });

    if (!reduced && playing) {
      ctx.fillStyle = "rgba(240, 194, 122, 0.85)";
      ctx.fillRect(p * w, 0, 2, h);
    }
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    await audio.play();
    setPlaying(true);
  }

  return (
    <motion.article
      className={styles.player}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.top}>
        <div>
          <span className={styles.badge}>{badge}</span>
          <h3>{title}</h3>
          <p>{meta}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void toggle()}>
          {playing ? pauseLabel : playLabel}
        </button>
      </div>
      <canvas ref={canvasRef} className={styles.wave} aria-hidden="true" />
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className={styles.progress} aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
    </motion.article>
  );
}
