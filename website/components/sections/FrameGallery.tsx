"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { SplashFrame } from "@/components/frames/SplashFrame";
import { LibraryFrame } from "@/components/frames/LibraryFrame";
import { SongEditorFrame } from "@/components/frames/SongEditorFrame";
import { PianoRollFrame } from "@/components/frames/PianoRollFrame";
import { CandidateCompareFrame } from "@/components/frames/CandidateCompareFrame";
import { SettingsFrame } from "@/components/frames/SettingsFrame";
import styles from "./FrameGallery.module.css";

const FRAMES = [
  { key: "splash", node: <SplashFrame /> },
  { key: "library", node: <LibraryFrame /> },
  { key: "editor", node: <SongEditorFrame /> },
  { key: "piano", node: <PianoRollFrame /> },
  { key: "compare", node: <CandidateCompareFrame /> },
  { key: "settings", node: <SettingsFrame /> },
] as const;

export function FrameGallery() {
  const t = useTranslations("gallery");
  const reduced = useReducedMotion();

  return (
    <section className="section" id="gallery" data-animate-section>
      <div className="section-head">
        <h2 className="section-title">{t("title")}</h2>
        <p className="section-body">{t("body")}</p>
      </div>
      <div className={styles.grid}>
        {FRAMES.map((frame, i) => (
          <motion.figure
            key={frame.key}
            className={styles.figure}
            data-frame-card
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            {frame.node}
            <figcaption>{t(`frames.${frame.key}`)}</figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}
