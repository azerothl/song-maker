import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "./CtaFinal.module.css";

const DOWNLOAD_URL = "https://github.com/azerothl/song-maker";

export async function CtaFinal() {
  const t = await getTranslations("cta");

  return (
    <section className={`section ${styles.cta}`} data-animate-section>
      <h2 className="section-title">{t("title")}</h2>
      <p className="section-body">{t("body")}</p>
      <div className="cta-group" style={{ marginTop: "1.5rem" }}>
        <a className="btn btn-primary" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
          {t("download")}
        </a>
        <Link className="btn btn-ghost" href="/docs">
          {t("docs")}
        </Link>
      </div>
    </section>
  );
}
