import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "./CtaFinal.module.css";

export async function CtaFinal() {
  const t = await getTranslations("cta");

  return (
    <section className={`section ${styles.cta}`} data-animate-section>
      <h2 className="section-title">{t("title")}</h2>
      <p className="section-body">{t("body")}</p>
      <div className="cta-group" style={{ marginTop: "1.5rem" }}>
        <Link className="btn btn-primary" href="/downloads">
          {t("download")}
        </Link>
        <Link className="btn btn-ghost" href="/docs">
          {t("docs")}
        </Link>
      </div>
    </section>
  );
}
