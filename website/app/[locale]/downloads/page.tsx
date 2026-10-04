import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { APP_VERSION, RELEASE_LATEST_PAGE, releaseAssets } from "@/lib/releases";
import styles from "./downloads.module.css";

type Props = { params: Promise<{ locale: string }> };

export default async function DownloadsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("downloads");

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{t("eyebrow", { version: APP_VERSION })}</p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.intro}>{t("intro")}</p>
        <p className={styles.intro}>
          {t("whatsNew", { version: APP_VERSION })}{" "}
          <Link href={`/docs/${locale === "fr" ? "nouveautes" : "whats-new"}`}>
            {t("whatsNewCta")}
          </Link>
        </p>

        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="windows-title">
            <p className={styles.number}>01 / WINDOWS</p>
            <h2 id="windows-title">{t("windows.title")}</h2>
            <p className={styles.description}>{t("windows.description")}</p>
            <div className={styles.links}>
              <a href={releaseAssets.windowsSetup}>
                <span>{t("windows.setup")}</span><span aria-hidden="true">↓</span>
              </a>
              <a href={releaseAssets.windowsMsi}>
                <span>{t("windows.msi")}</span><span aria-hidden="true">↓</span>
              </a>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="macos-title">
            <p className={styles.number}>02 / MACOS</p>
            <h2 id="macos-title">{t("macos.title")}</h2>
            <p className={styles.description}>{t("macos.description")}</p>
            <div className={styles.links}>
              <a href={releaseAssets.macAppleSilicon}>
                <span>{t("macos.appleSilicon")}</span><span aria-hidden="true">↓</span>
              </a>
              <a href={releaseAssets.macIntel}>
                <span>{t("macos.intel")}</span><span aria-hidden="true">↓</span>
              </a>
            </div>
          </section>

          <section className={styles.card} aria-labelledby="linux-title">
            <p className={styles.number}>03 / LINUX</p>
            <h2 id="linux-title">{t("linux.title")}</h2>
            <p className={styles.description}>{t("linux.description")}</p>
            <div className={styles.links}>
              <a href={releaseAssets.linuxAppImage}>
                <span>{t("linux.appimage")}</span><span aria-hidden="true">↓</span>
              </a>
              <a href={releaseAssets.linuxDeb}>
                <span>{t("linux.deb")}</span><span aria-hidden="true">↓</span>
              </a>
              <a href={releaseAssets.linuxRpm}>
                <span>{t("linux.rpm")}</span><span aria-hidden="true">↓</span>
              </a>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <p>{t("firstRun")}</p>
          <div>
            <Link className="btn btn-primary" href="/docs/install">{t("guide")}</Link>
            <a className="btn btn-ghost" href={RELEASE_LATEST_PAGE}>
              {t("github")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
