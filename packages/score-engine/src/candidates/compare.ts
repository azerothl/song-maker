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
  /** Null until the user picks — never auto-chosen (§21.3). */
  selectedId: string | null;
};

export interface CandidateComparer {
  /** Open a compare session; does not pick a winner. */
  openCompare(candidates: GenerationCandidate[]): CandidateCompareView;
  select(view: CandidateCompareView, candidateId: string): CandidateCompareView;
  clearSelection(view: CandidateCompareView): CandidateCompareView;
}

export class DefaultCandidateComparer implements CandidateComparer {
  openCompare(candidates: GenerationCandidate[]): CandidateCompareView {
    if (candidates.length === 0) {
      throw new ScoreEngineError(
        "validation_failed",
        "aucun candidat à comparer",
      );
    }
    const ids = new Set<string>();
    for (const c of candidates) {
      if (ids.has(c.id)) {
        throw new ScoreEngineError(
          "validation_failed",
          `candidat en double: ${c.id}`,
        );
      }
      ids.add(c.id);
    }
    return { candidates: [...candidates], selectedId: null };
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

  clearSelection(view: CandidateCompareView): CandidateCompareView {
    return { ...view, selectedId: null };
  }
}

/** @deprecated Prefer DefaultCandidateComparer. */
export class StubCandidateComparer extends DefaultCandidateComparer {}

export function createCandidateComparer(): CandidateComparer {
  return new DefaultCandidateComparer();
}
