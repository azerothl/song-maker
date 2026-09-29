import { Profiler, type ReactNode } from "react";

/**
 * Chronométrage de diagnostic, actif uniquement en développement.
 *
 * Les chemins chauds (composition abcjs, export ABC) sont synchrones et
 * bloqueurs : sans mesure, un gel de plusieurs secondes n'a aucune cause
 * identifiable. Les appels sont sans coût en production (Vite élimine la
 * branche morte).
 */
export function traceTiming(
  label: string,
  startedAt: number,
  detail?: Record<string, string | number | boolean>,
): void {
  if (!import.meta.env.DEV) return;
  const ms = performance.now() - startedAt;
  const suffix = detail
    ? ` ${Object.entries(detail)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`
    : "";
  console.info(`[perf] ${label} ${ms.toFixed(1)}ms${suffix}`);
}

/**
 * Enveloppe un sous-arbre et journalise la durée réelle de chaque commit.
 *
 * contrairement à `traceTiming`, qui ne mesure qu'un point choisi,
 * `<Profiler>` attribue le temps à un composant : c'est ce qui permet de
 * savoir *où* passe le gel sans deviner.
 */
export function PerfProbe({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  if (!import.meta.env.DEV) return <>{children}</>;
  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration) => {
        if (actualDuration >= 16) {
          console.info(
            `[perf] <${id}> ${phase} ${actualDuration.toFixed(1)}ms`,
          );
        }
      }}
    >
      {children}
    </Profiler>
  );
}

/**
 * Signale toute tâche longue (> 150 ms) du thread principal.
 *
 * React ne rapporte que le temps de rendu ; une tâche longue peut venir d'un
 * travail synchrone hors React. C'est le détecteur qui dit si le gel existe
 * encore, indépendamment de nos hypothèses.
 */
export function installLongTaskProbe(thresholdMs = 150): void {
  if (!import.meta.env.DEV) return;
  if (typeof PerformanceObserver === "undefined") return;
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    console.info("[perf] longtask non supporté par ce navigateur");
    return;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration >= thresholdMs) {
        console.info(
          `[perf] tache longue ${entry.duration.toFixed(1)}ms (seuil ${thresholdMs}ms)`,
        );
      }
    }
  });
  observer.observe({ entryTypes: ["longtask"] });
}
