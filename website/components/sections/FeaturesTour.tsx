import { getTranslations } from "next-intl/server";
import styles from "./FeaturesTour.module.css";

const KEYS = [
  "yue2",
  "score",
  "candidates",
  "stems",
  "mix",
  "export",
  "lora",
  "remote",
] as const;

export async function FeaturesTour() {
  const t = await getTranslations("features");

  return (
    <section className="section" id="features" data-animate-section>
      <div className="section-head">
        <h2 className="section-title">{t("title")}</h2>
        <p className="section-body">{t("body")}</p>
      </div>
      <div className={styles.rail} data-feature-rail>
        {KEYS.map((key, index) => (
          <article key={key} className={styles.item} data-feature-item>
            <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{t(`items.${key}.title`)}</h3>
            <p>{t(`items.${key}.body`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
