import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AppLocale } from "@/i18n/routing";
import { APP_VERSION } from "@/lib/releases";

const DOCS_ROOT = path.join(process.cwd(), "content/docs");

export type DocMeta = {
  slug: string;
  title: string;
  description: string;
  order: number;
};

export type DocPage = DocMeta & {
  content: string;
};

function docsDir(locale: AppLocale) {
  return path.join(DOCS_ROOT, locale);
}

export function localeDocsPath(
  locale: AppLocale,
  slugs: Record<AppLocale, string>,
): string {
  switch (locale) {
    case "fr":
      return slugs.fr;
    case "en":
      return slugs.en;
    default: {
      const _exhaustive: never = locale;
      return _exhaustive;
    }
  }
}

export function listDocs(locale: AppLocale): DocMeta[] {
  const dir = docsDir(locale);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: String(data.title ?? file),
        description: String(data.description ?? ""),
        order: Number(data.order ?? 99),
      };
    })
    .sort((a, b) => a.order - b.order);
}

export function getDoc(locale: AppLocale, slug: string): DocPage | null {
  const file = path.join(docsDir(locale), `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ""),
    order: Number(data.order ?? 99),
    // Keep install download links aligned with root package.json / release assets.
    content: content.replaceAll("__APP_VERSION__", APP_VERSION),
  };
}
