import type {
  SeparationRequest,
  SeparationResult,
  StemDescriptor,
  StemSeparatorCapabilities,
  StemSeparatorProvider,
} from "./types.js";
import { reliabilityForRole } from "./types.js";

/**
 * Shape of the phase-1 HTDemucs adapter (§9, §2.2).
 * No HTTP or FFmpeg here — only the contract and package metadata so a
 * future worker can implement `separate` against audiocpp_server.
 */
export const HTDEMUCS_PACKAGE = {
  family: "htdemucs",
  packageId: "htdemucs_q8_0",
  gguf: "htdemucs-q8_0.gguf",
  sha256:
    "b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388",
  repo: "audio-cpp/audio.cpp-gguf",
} as const;

export const HTDEMUCS_CAPABILITIES: StemSeparatorCapabilities = {
  id: "audiocpp-htdemucs",
  family: HTDEMUCS_PACKAGE.family,
  roles: ["vocals", "drums", "bass", "other"],
  marksExtrasLessReliable: false,
};

const CORE_STEM_FILES: ReadonlyArray<{
  role: "vocals" | "drums" | "bass" | "other";
  path: string;
}> = [
  { role: "vocals", path: "vocals-48000.wav" },
  { role: "drums", path: "drums-48000.wav" },
  { role: "bass", path: "bass-48000.wav" },
  { role: "other", path: "other-48000.wav" },
];

/**
 * Adapter shape for HTDemucs via audio.cpp.
 * `separate` is intentionally unimplemented: phase 1 owns the live call.
 */
export class HtDemucsStemSeparator implements StemSeparatorProvider {
  readonly capabilities = HTDEMUCS_CAPABILITIES;

  /**
   * Builds the expected stem list once files exist on disk.
   * Does not run FFmpeg or call the server.
   */
  describeExpectedStems(checksums: Record<string, string>): StemDescriptor[] {
    return CORE_STEM_FILES.map(({ role, path }) => {
      const sha256 = checksums[path];
      if (!sha256) {
        throw new Error(`Missing checksum for stem ${path}`);
      }
      return {
        role,
        path,
        sha256,
        reliability: reliabilityForRole(role),
      };
    });
  }

  async separate(_request: SeparationRequest): Promise<SeparationResult> {
    throw new Error(
      "HtDemucsStemSeparator.separate is not implemented in this foundation package. Wire the phase-1 audiocpp worker here in phase 3.",
    );
  }
}

export function createHtDemucsStemSeparator(): StemSeparatorProvider {
  return new HtDemucsStemSeparator();
}
