import type { GenerationSummary } from "./types";

export const YUE2_ENGINE_ID = "yue2_3b";
export const ACE_STEP_ENGINE_ID = "ace_step_1_5";

export function generationEngineId(g: GenerationSummary): string {
  return g.engineId?.trim() || YUE2_ENGINE_ID;
}

export function isAceStepGeneration(g: GenerationSummary): boolean {
  return generationEngineId(g) === ACE_STEP_ENGINE_ID;
}

export function pickEngineAbPair(generations: GenerationSummary[]): {
  yue2: GenerationSummary;
  aceStep: GenerationSummary;
} | null {
  const ready = generations.filter(
    (g) => g.state === "generated" && Boolean(g.audioPath),
  );
  const yue2 = [...ready].reverse().find((g) => generationEngineId(g) === YUE2_ENGINE_ID);
  const aceStep = [...ready].reverse().find(isAceStepGeneration);
  if (!yue2 || !aceStep) return null;
  return { yue2, aceStep };
}
