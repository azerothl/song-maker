import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { Link } from "@/i18n/navigation";
import { getDoc, listDocs } from "@/lib/docs";
import { routing, type AppLocale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    listDocs(locale).map((doc) => ({ locale, slug: doc.slug })),
  );
}

export default async function DocPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs");
  const doc = getDoc(locale as AppLocale, slug);
  if (!doc) notFound();

  const docs = listDocs(locale as AppLocale);

  return (
    <div className="docs-layout">
      <aside className="docs-nav" aria-label={t("toc")}>
        <Link href="/docs">{t("title")}</Link>
        {docs.map((item) => (
          <Link
            key={item.slug}
            href={`/docs/${item.slug}`}
            aria-current={item.slug === slug ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </aside>
      <article className="docs-article">
        <MDXRemote source={doc.content} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
      </article>
    </div>
  );
}
