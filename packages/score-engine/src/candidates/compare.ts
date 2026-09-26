import { ScoreEngineError } from "../types/errors.js";

/**
 * Multi-candidate compare (§8.6 / Phase 2).
 * One generation = one candidate; no automatic winner.
 */
export type GenerationCandidate = {
  id: string;
  generationFolder: string;
  seed: number;
  createdAt: string;
  audioPath: string;
  scoreAbcPath: string | null;
  label?: string;
};

export type CandidateCompareView = {
  candidates: GenerationCandidate[];
  /** Always null — no automatic winner (§21.3). */
  selectedId: string | null;
};

export interface CandidateComparer {
  /** Queue sequential generation slots; does not pick a winner. */
  openCompare(candidates: GenerationCandidate[]): CandidateCompareView;
  select(view: CandidateCompareView, candidateId: string): CandidateCompareView;
}

export class StubCandidateComparer implements CandidateComparer {
  openCompare(candidates: GenerationCandidate[]): CandidateCompareView {
    if (candidates.length === 0) {
      throw new ScoreEngineError(
        "validation_failed",
        "aucun candidat à comparer",
      );
    }
    return { candidates, selectedId: null };
  }

  select(
    view: CandidateCompareView,
    candidateId: string,
  ): CandidateCompareView {
    if (!view.candidates.some((c) => c.id === candidateId)) {
      throw new ScoreEngineError(
        "validation_failed",
        `candidat inconnu: ${candidateId}`,
      );
    }
    return { ...view, selectedId: candidateId };
  }
}

export function createCandidateComparer(): CandidateComparer {
  return new StubCandidateComparer();
}
