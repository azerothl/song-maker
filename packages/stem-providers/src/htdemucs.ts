import type {
  AudiocppSepTransport,
  SeparationRequest,
  SeparationResult,
  StemDescriptor,
  StemRole,
  StemSeparatorCapabilities,
  StemSeparatorProvider,
} from "./types.js";
import { reliabilityForRole } from "./types.js";

/**
 * Shape of the phase-1 HTDemucs adapter (§9, §2.2).
 * Package metadata is pinned; live `separate` needs an AudiocppSepTransport.
 */
export const HTDEMUCS_PACKAGE = {
  family: "htdemucs",
  packageId: "htdemucs_q8_0",
  /** Model id registered in audiocpp-server.json */
  modelId: "htdemucs",
  gguf: "htdemucs-q8_0.gguf",
  sha256:
    "b0f532ac6e5f373aeb11fa0df73253251e133832d9c8b9942dc58f50bc5b4388",
  repo: "audio-cpp/audio.cpp-gguf",
} as const;

export const HTDEMUCS_CAPABILITIES: StemSeparatorCapabilities = {
  id: "audiocpp-htdemucs",
  family: HTDEMUCS_PACKAGE.family,
  roles: ["vocals", "drums", "bass", "other"],
  unavailableRoles: ["guitar", "piano"],
  marksExtrasLessReliable: false,
  displayNameFr: "HTDemucs (défaut)",
  stemLayoutNoteFr:
    "Quatre stems : voix, batterie, basse, accompagnement. Guitare et piano non exposés.",
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
 * Maps audiocpp named output ids → Song Maker stem roles for HTDemucs.
 */
export function mapHtDemucsStemIds(namedStemIds: string[]): StemRole[] {
  const found = new Set<StemRole>();
  for (const id of namedStemIds) {
    const lower = id.toLowerCase();
    if (lower.includes("vocal")) found.add("vocals");
    else if (lower.includes("drum")) found.add("drums");
    else if (lower.includes("bass")) found.add("bass");
    else if (lower.includes("other") || lower.includes("accomp")) {
      found.add("other");
    }
  }
  return [...found];
}

export class HtDemucsStemSeparator implements StemSeparatorProvider {
  readonly capabilities = HTDEMUCS_CAPABILITIES;

  constructor(private readonly transport?: AudiocppSepTransport) {}

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

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    if (!this.transport) {
      throw new Error(
        "HtDemucsStemSeparator requires an AudiocppSepTransport (wire the Tauri / audiocpp worker).",
      );
    }
    const audioPath =
      request.separatorInputPath ??
      `${request.outputDir.replace(/\/$/, "")}/input-44100.wav`;
    const { namedStemIds } = await this.transport.runSeparation({
      modelId: HTDEMUCS_PACKAGE.modelId,
      family: HTDEMUCS_PACKAGE.family,
      audioPath44100: audioPath,
      outputDir: request.outputDir,
    });

    const mapped = mapHtDemucsStemIds(namedStemIds);
    const missingCore = HTDEMUCS_CAPABILITIES.roles.filter(
      (r) => !mapped.includes(r),
    );
    if (missingCore.length > 0) {
      throw new Error(
        `HTDemucs n’a pas produit les stems attendus : ${missingCore.join(", ")} (reçus : ${namedStemIds.join(", ")})`,
      );
    }

    const sha = this.transport.sha256File;
    const stems: StemDescriptor[] = [];
    for (const { role, path } of CORE_STEM_FILES) {
      const abs = `${request.outputDir.replace(/\/$/, "")}/${path}`;
      const sha256 = sha ? await sha(abs) : "0".repeat(64);
      stems.push({
        role,
        path,
        sha256,
        reliability: reliabilityForRole(role),
      });
    }

    return {
      family: HTDEMUCS_PACKAGE.family,
      packageId: HTDEMUCS_PACKAGE.packageId,
      gguf: HTDEMUCS_PACKAGE.gguf,
      sha256: HTDEMUCS_PACKAGE.sha256,
      separatorInput: {
        path: "input-44100.wav",
        sampleRate: 44100,
        resampler: "ffmpeg-soxr-precision-28",
      },
      stems,
      unavailableRoles: [...HTDEMUCS_CAPABILITIES.unavailableRoles],
      warnings: [
        "estimated-separation",
        "guitar-piano-unavailable",
      ],
    };
  }
}

export function createHtDemucsStemSeparator(
  transport?: AudiocppSepTransport,
): StemSeparatorProvider {
  return new HtDemucsStemSeparator(transport);
}
