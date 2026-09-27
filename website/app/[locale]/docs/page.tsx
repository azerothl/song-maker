import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listDocs } from "@/lib/docs";
import type { AppLocale } from "@/i18n/routing";
import styles from "./docs.module.css";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DocsIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs");
  const docs = listDocs(locale as AppLocale);

  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label={t("toc")}>
        <Link href="/">{t("back")}</Link>
        {docs.map((doc) => (
          <Link key={doc.slug} href={`/docs/${doc.slug}`}>
            {doc.title}
          </Link>
        ))}
      </aside>
      <div className="docs-article">
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
        <ul className={styles.indexList}>
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link href={`/docs/${doc.slug}`}>
                <strong>{doc.title}</strong>
                <span>{doc.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
