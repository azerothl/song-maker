import type {
  SeparationRequest,
  SeparationResult,
  StemSeparatorCapabilities,
  StemSeparatorProvider,
} from "./types.js";

/**
 * Second-provider stub for BS-RoFormer (`bs_roformer`) via audio.cpp (§23 phase 3).
 * Documented as a candidate once a second separator exists; not used in phase 1.
 */
export const BS_ROFORMER_PACKAGE = {
  family: "bs_roformer",
  packageId: "bs_roformer_stub",
  /** Package / GGUF ids filled when a concrete audio.cpp pack is pinned. */
  gguf: undefined,
  sha256: undefined,
} as const;

export const BS_ROFORMER_CAPABILITIES: StemSeparatorCapabilities = {
  id: "audiocpp-bs-roformer",
  family: BS_ROFORMER_PACKAGE.family,
  roles: ["vocals", "drums", "bass", "other", "guitar", "piano"],
  marksExtrasLessReliable: true,
};

/**
 * Stub only — no download, no inference, no weights.
 */
export class BsRoFormerStemSeparatorStub implements StemSeparatorProvider {
  readonly capabilities = BS_ROFORMER_CAPABILITIES;

  async separate(_request: SeparationRequest): Promise<SeparationResult> {
    throw new Error(
      "BS-RoFormer separator is a phase-3 stub. Pin an audio.cpp bs_roformer package before implementing separate().",
    );
  }
}

export function createBsRoFormerStemSeparatorStub(): StemSeparatorProvider {
  return new BsRoFormerStemSeparatorStub();
}
