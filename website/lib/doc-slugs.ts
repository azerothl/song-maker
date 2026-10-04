import type { AppLocale } from "@/i18n/routing";

/**
 * One guide per row, same order in FR and EN. Slugs may differ by language;
 * the locale switcher and unknown-slug redirects use this table.
 */
export const DOC_PAIRS = [
  { topic: "install", fr: "install", en: "install" },
  { topic: "whats-new", fr: "nouveautes", en: "whats-new" },
  { topic: "setup", fr: "configuration", en: "setup" },
  { topic: "batch", fr: "generation-batch", en: "batch-generation" },
  { topic: "first-song", fr: "premier-morceau", en: "first-song" },
  { topic: "score", fr: "partition-abc", en: "score-abc" },
  { topic: "mix-export", fr: "mix-export", en: "mix-export" },
  { topic: "agent-remote", fr: "agent-remote", en: "agent-remote" },
  { topic: "gpu", fr: "depannage-gpu", en: "gpu-troubleshooting" },
] as const;

export type DocTopic = (typeof DOC_PAIRS)[number]["topic"];

const DOC_BY_TOPIC = Object.fromEntries(
  DOC_PAIRS.map((entry) => [entry.topic, entry]),
) as Record<DocTopic, (typeof DOC_PAIRS)[number]>;

export function docsPath(locale: AppLocale, topic: DocTopic): string {
  const pair = DOC_BY_TOPIC[topic];
  switch (locale) {
    case "fr":
      return `/docs/${pair.fr}`;
    case "en":
      return `/docs/${pair.en}`;
    default: {
      const _exhaustive: never = locale;
      return _exhaustive;
    }
  }
}

/** Map a docs slug to the equivalent page in `target` locale, or null if unknown. */
export function localizeDocSlug(slug: string, target: AppLocale): string | null {
  const pair = DOC_PAIRS.find((entry) => entry.fr === slug || entry.en === slug);
  if (!pair) return null;
  switch (target) {
    case "fr":
      return pair.fr;
    case "en":
      return pair.en;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/** Rewrite `/docs/:slug` when switching locale; leave other paths unchanged. */
export function localizePathname(pathname: string, target: AppLocale): string {
  const match = /^\/docs\/([^/]+)\/?$/.exec(pathname);
  if (!match) return pathname;
  const localized = localizeDocSlug(match[1], target);
  if (localized == null) return pathname;
  return `/docs/${localized}`;
}

export function expectedDocSlugs(locale: AppLocale): readonly string[] {
  switch (locale) {
    case "fr":
      return DOC_PAIRS.map((entry) => entry.fr);
    case "en":
      return DOC_PAIRS.map((entry) => entry.en);
    default: {
      const _exhaustive: never = locale;
      return _exhaustive;
    }
  }
}
