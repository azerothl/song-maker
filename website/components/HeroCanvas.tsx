"use client";

import { useEffect, useRef } from "react";
import styles from "./HeroCanvas.module.css";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let raf = 0;
    let running = true;
    const bars = 64;
    const phases = Array.from({ length: bars }, (_, i) => Math.random() * Math.PI * 2 + i);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, "rgba(232, 165, 75, 0.08)");
      gradient.addColorStop(0.55, "rgba(20, 24, 32, 0.2)");
      gradient.addColorStop(1, "rgba(106, 143, 173, 0.08)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      const mid = h * 0.58;
      const gap = w / (bars + 2);
      for (let i = 0; i < bars; i++) {
        const x = gap * (i + 1);
        const pulse = reduced
          ? 0.35 + (i % 7) * 0.04
          : 0.25 +
            0.55 *
              (0.5 +
                0.5 *
                  Math.sin(t * 0.0022 + phases[i]) *
                  Math.cos(t * 0.0011 + i * 0.2));
        const barH = h * 0.28 * pulse;
        const warm = 0.45 + pulse * 0.55;
        ctx.fillStyle = `rgba(232, 165, 75, ${0.18 + pulse * 0.35})`;
        ctx.fillRect(x, mid - barH, Math.max(2, gap * 0.45), barH);
        ctx.fillStyle = `rgba(240, 194, 122, ${0.08 + warm * 0.12})`;
        ctx.fillRect(x, mid, Math.max(2, gap * 0.45), barH * 0.55);
      }

      // console glow horizon
      const glow = ctx.createRadialGradient(w * 0.5, mid, 10, w * 0.5, mid, w * 0.45);
      glow.addColorStop(0, "rgba(232, 165, 75, 0.16)");
      glow.addColorStop(1, "rgba(232, 165, 75, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      if (!reduced) {
        raf = window.requestAnimationFrame(draw);
      }
    };

    if (reduced) {
      draw(0);
    } else {
      raf = window.requestAnimationFrame(draw);
    }

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
