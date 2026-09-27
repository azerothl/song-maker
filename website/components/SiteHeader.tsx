"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const onDocs = pathname.startsWith("/docs");

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Song Maker">
          Song Maker
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          {!onDocs ? (
            <>
              <a href="#features">{t("features")}</a>
              <a href="#parcours">{t("examples")}</a>
              <a href="#configuration">{t("gallery")}</a>
              <a href="#resources">{t("license")}</a>
            </>
          ) : null}
          <Link href="/docs">{t("docs")}</Link>
        </nav>
        <div className={styles.actions}>
          <LocaleSwitcher />
          <Link className="btn btn-primary" href="/downloads">
            {t("download")}
          </Link>
        </div>
      </div>
    </header>
  );
}
