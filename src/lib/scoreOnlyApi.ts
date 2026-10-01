/**
 * Helpers for SongScreen wiring of stop_after=abc + multi-render (#32).
 * Keep SongScreen thin: call these from button handlers.
 */
import type { FormInput, ProjectDoc } from "./types";
import { api } from "./api";

export async function generateScoreOnly(
  projectId: string,
  form: FormInput,
): Promise<ProjectDoc> {
  if (form.cot === "off") {
    throw new Error("stop_after=abc exige cot=melody|full.");
  }
  return api.startGeneration(projectId, form, null, { stopAfter: "abc" });
}

export async function renderNFromScore(
  projectId: string,
  sourceGenId: string,
  form: FormInput,
  count: number,
): Promise<ProjectDoc | null> {
  let last: ProjectDoc | null = null;
  for (let i = 0; i < count; i++) {
    const formForCall: FormInput =
      i === 0 || form.seed == null ? form : { ...form, seed: null };
    last = await api.renderFromGeneration(projectId, sourceGenId, formForCall);
  }
  return last;
}
