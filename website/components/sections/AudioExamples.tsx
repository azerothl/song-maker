"use client";

import { useTranslations } from "next-intl";
import { DEMO_EXAMPLES } from "@/lib/examples";
import { WaveformPlayer } from "./WaveformPlayer";
import styles from "./AudioExamples.module.css";

export function AudioExamples() {
  const t = useTranslations("examples");

  return (
    <section className="section" id="examples" data-animate-section>
      <div className="section-head">
        <h2 className="section-title">{t("title")}</h2>
        <p className="section-body">{t("body")}</p>
      </div>
      <div className={styles.list}>
        {DEMO_EXAMPLES.map((ex) => (
          <WaveformPlayer
            key={ex.id}
            src={ex.src}
            title={t(ex.titleKey)}
            meta={t(ex.metaKey)}
            badge={t("demoBadge")}
            playLabel={t("play")}
            pauseLabel={t("pause")}
          />
        ))}
      </div>
    </section>
  );
}
