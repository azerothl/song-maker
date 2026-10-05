/**
 * Helpers for SongScreen wiring of stop_after=abc + multi-render (#32).
 * Keep SongScreen thin: call these from button handlers.
 */
import type { FormInput, ProjectDoc } from "./types";
import { api } from "./api";
import { vocalToInsAbc } from "./score";

export async function generateScoreOnly(
  projectId: string,
  form: FormInput,
): Promise<ProjectDoc> {
  if (form.cot === "off") {
    throw new Error("stop_after=abc exige cot=melody|full.");
  }
  return api.startGeneration(projectId, form, null, { stopAfter: "abc" });
}

/**
 * YuE2's instrumental route first asks its planner for a score, transfers the
 * Vocal melody into Ins, then renders the edited ABC with empty lyrics.
 */
export async function generateInstrumentalTake(
  projectId: string,
  form: FormInput,
  sourceAbc?: string | null,
): Promise<ProjectDoc> {
  const abc = await prepareInstrumentalScore(projectId, form, sourceAbc, false);
  return api.startGeneration(projectId, form, abc);
}

/** Creates a YuE2 instrumental alternative without changing the active take. */
export async function generateInstrumentalComparisonTake(
  projectId: string,
  form: FormInput,
  sourceAbc?: string | null,
): Promise<void> {
  const abc = await prepareInstrumentalScore(projectId, form, sourceAbc, true);
  await api.generateComparisonTake(projectId, form, abc);
}

async function prepareInstrumentalScore(
  projectId: string,
  form: FormInput,
  sourceAbc: string | null | undefined,
  preserveProject: boolean,
): Promise<string> {
  if (!form.instrumentalMode) {
    throw new Error("La génération instrumentale exige le mode Instrumental.");
  }
  if (form.cot === "off") {
    throw new Error("Choisissez Partition complète ou Mélodie pour préparer une partition instrumentale.");
  }

  let abc = sourceAbc?.trim() || null;
  if (!abc) {
    const sourceGenerationId = preserveProject
      ? (await api.generateComparisonTake(projectId, form, null, undefined, "abc")).generationId
      : (await generateScoreOnly(projectId, form)).activeGenerationId;
    if (!sourceGenerationId) {
      throw new Error("La partition instrumentale n’a pas été enregistrée.");
    }
    abc = await api.readScoreAbc(projectId, sourceGenerationId);
  }
  if (!abc?.trim()) {
    throw new Error("YuE2 n’a pas renvoyé de partition à préparer en version instrumentale.");
  }

  const instrumentalScore = vocalToInsAbc(abc);
  return instrumentalScore.abc;
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
