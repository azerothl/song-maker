"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { localizePathname } from "@/lib/doc-slugs";
import styles from "./LocaleSwitcher.module.css";

export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={styles.switcher} role="group" aria-label="Language">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? styles.active : undefined}
          aria-pressed={l === locale}
          onClick={() => router.replace(localizePathname(pathname, l), { locale: l })}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
