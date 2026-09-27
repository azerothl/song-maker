"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { HeroCanvas } from "@/components/HeroCanvas";
import styles from "./Hero.module.css";

export function Hero() {
  const t = useTranslations("hero");
  const reduced = useReducedMotion();

  return (
    <section className={styles.hero} aria-label="Hero">
      <HeroCanvas />
      <div className={styles.veil} />
      <div className={styles.content}>
        <motion.h1
          className={styles.brand}
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {t("brand")}
        </motion.h1>
        <motion.p
          className={styles.headline}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          {t("headline")}
        </motion.p>
        <motion.p
          className={styles.sentence}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {t("sentence")}
        </motion.p>
        <motion.div
          className="cta-group"
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link className="btn btn-primary" href="/downloads">
            {t("ctaDownload")}
          </Link>
          <Link className="btn btn-ghost" href="/docs">
            {t("ctaDocs")}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
