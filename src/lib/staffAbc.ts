import type { CotProfile, ScoreDocument, ScoreIssue } from "./score";
import { exportScoreAbc, validateScoreForGeneration } from "./score";

export type StaffAbcResult =
  | {
      ok: true;
      abc: string;
      warnings: string[];
      /** Cot used for display export only (not necessarily the generation cot). */
      displayCot: Exclude<CotProfile, "off">;
    }
  | {
      ok: false;
      abc: null;
      error: string;
      issues: ScoreIssue[];
    };

/**
 * Build ABC for staff rendering from a ScoreDocument.
 * Prefers cot=full so chords / Ins stay visible; falls back to melody.
 * Never invents notes — only exports what the model already holds.
 */
export function buildStaffAbc(
  document: ScoreDocument,
  title?: string,
): StaffAbcResult {
  const attempts: Array<Exclude<CotProfile, "off">> = ["full", "melody"];
  const collected: ScoreIssue[] = [];

  for (const cot of attempts) {
    const check = validateScoreForGeneration(document, cot);
    collected.push(...check.issues);
    if (!check.ok) continue;
    try {
      const { abc, warnings } = exportScoreAbc(
        document,
        cot,
        title || undefined,
      );
      if (!abc.trim()) {
        continue;
      }
      return {
        ok: true,
        abc,
        warnings: [
          ...warnings,
          ...check.issues
            .filter((i) => i.severity === "warning")
            .map((i) => i.message),
        ],
        displayCot: cot,
      };
    } catch (e) {
      collected.push({
        code: "validation_failed",
        severity: "error",
        message: String(e),
      });
    }
  }

  const firstError =
    collected.find((i) => i.severity === "error")?.message ??
    "Partition non exportable en ABC pour la portée.";
  return {
    ok: false,
    abc: null,
    error: firstError,
    issues: collected,
  };
}
