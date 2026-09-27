import { getTranslations } from "next-intl/server";
import styles from "./FaqSection.module.css";

const KEYS = ["gpu", "suno", "os", "commercial"] as const;

export async function FaqSection() {
  const t = await getTranslations("faq");

  return (
    <section className="section" id="faq" data-animate-section>
      <div className="section-head">
        <h2 className="section-title">{t("title")}</h2>
      </div>
      <div className={styles.list}>
        {KEYS.map((key) => (
          <details key={key} className={styles.item}>
            <summary>{t(`items.${key}.q`)}</summary>
            <p>{t(`items.${key}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
