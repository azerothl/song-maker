import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import fr from "./fr.json";
import enProfiles from "./en.profiles.json";
import enProduction from "./en.production.json";
import enApp from "./en.app.json";

const enStrings: Record<string, string> = {
  ...enApp,
  ...enProfiles,
  ...enProduction,
};

type Keys = keyof typeof fr;

export type AppLocale = "fr" | "en";

export const LOCALE_STORAGE_KEY = "song-maker.locale";

const listeners = new Set<() => void>();

function readStoredLocale(): AppLocale {
  if (typeof localStorage === "undefined") return "fr";
  return localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : "fr";
}

let currentLocale: AppLocale = readStoredLocale();

function applyDocumentLang(locale: AppLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

applyDocumentLang(currentLocale);

export function profileLocale(): AppLocale {
  const stored = readStoredLocale();
  if (stored !== currentLocale) {
    currentLocale = stored;
    applyDocumentLang(stored);
  }
  return currentLocale;
}

export function setAppLocale(locale: AppLocale): void {
  currentLocale = locale;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  applyDocumentLang(locale);
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-render when the desktop locale changes. */
export function useAppLocale(): AppLocale {
  const [locale, setLocale] = useState(currentLocale);
  useEffect(() => subscribeLocale(() => setLocale(currentLocale)), []);
  return locale;
}

export function t(key: Keys, vars?: Record<string, string | number>): string {
  const loc = profileLocale();
  let s: string =
    loc === "en" && key in enStrings
      ? enStrings[key]
      : (fr[key] ?? String(key));
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export function T({
  k,
  vars,
}: {
  k: Keys;
  vars?: Record<string, string | number>;
}): ReactNode {
  return t(k, vars);
}

export function englishCatalog(): Readonly<Record<string, string>> {
  return enStrings;
}
