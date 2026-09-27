import { getTranslations } from "next-intl/server";
import styles from "./LicenseSection.module.css";

export async function LicenseSection() {
  const t = await getTranslations("license");

  return (
    <section className={`section ${styles.section}`} id="license" data-animate-section>
      <div className="section-head">
        <h2 className="section-title">{t("title")}</h2>
        <p className="section-body">{t("body")}</p>
        <p className={styles.note}>{t("note")}</p>
      </div>
    </section>
  );
}
