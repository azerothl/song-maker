import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { Link, redirect } from "@/i18n/navigation";
import { assertDocLocaleParity, getDoc, listDocs } from "@/lib/docs";
import { DOC_PAIRS, localizeDocSlug } from "@/lib/doc-slugs";
import { routing, type AppLocale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  assertDocLocaleParity();
  const params: { locale: AppLocale; slug: string }[] = [];
  for (const locale of routing.locales) {
    for (const doc of listDocs(locale)) {
      params.push({ locale, slug: doc.slug });
    }
    for (const pair of DOC_PAIRS) {
      switch (locale) {
        case "fr":
          if (pair.en !== pair.fr) params.push({ locale, slug: pair.en });
          break;
        case "en":
          if (pair.fr !== pair.en) params.push({ locale, slug: pair.fr });
          break;
        default: {
          const _exhaustive: never = locale;
          void _exhaustive;
        }
      }
    }
  }
  return params;
}

export default async function DocPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;
  const localizedSlug = localizeDocSlug(slug, appLocale);
  if (localizedSlug == null) notFound();
  if (localizedSlug !== slug) {
    redirect({ href: `/docs/${localizedSlug}`, locale: appLocale });
  }
  const t = await getTranslations("docs");
  const doc = getDoc(appLocale, localizedSlug);
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
            aria-current={item.slug === localizedSlug ? "page" : undefined}
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
