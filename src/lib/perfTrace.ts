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
