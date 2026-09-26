import type { ReactNode } from "react";
import fr from "./fr.json";

type Keys = keyof typeof fr;

export function t(key: Keys, vars?: Record<string, string | number>): string {
  let s: string = fr[key] ?? String(key);
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
