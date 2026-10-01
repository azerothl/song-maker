import type { ReactNode } from "react";
import fr from "./fr.json";
import enProfiles from "./en.profiles.json";

type Keys = keyof typeof fr;

export function profileLocale(): "fr" | "en" {
  if (typeof localStorage === "undefined") return "fr";
  return localStorage.getItem("song-maker.locale") === "en" ? "en" : "fr";
}

export function t(key: Keys, vars?: Record<string, string | number>): string {
  const loc = profileLocale();
  let s: string =
    loc === "en" && key in enProfiles
      ? (enProfiles as Record<string, string>)[key]
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
