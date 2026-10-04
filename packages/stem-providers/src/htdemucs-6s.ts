import type {
  AudiocppSepTransport,
  SeparationRequest,
  SeparationResult,
  StemDescriptor,
  StemSeparatorCapabilities,
  StemSeparatorProvider,
} from "./types.js";
import { reliabilityForRole } from "./types.js";

export const HTDEMUCS_6S_PACKAGE = {
  family: "htdemucs_6s_onnx",
  packageId: "htdemucs_6s_fp16weights",
  modelId: "htdemucs_6s",
  artifact: "htdemucs_6s_fp16weights.onnx",
  repo: "StemSplitio/htdemucs-6s-onnx",
} as const;

export const HTDEMUCS_6S_CAPABILITIES: StemSeparatorCapabilities = {
  id: "demucs-onnx-htdemucs-6s",
  family: HTDEMUCS_6S_PACKAGE.family,
  roles: ["vocals", "drums", "bass", "other", "guitar", "piano"],
  unavailableRoles: [],
  marksExtrasLessReliable: true,
  displayNameFr: "HTDemucs 6 stems (expérimental)",
  stemLayoutNoteFr:
    "Six stems : voix, batterie, basse, accompagnement, guitare et piano. Les deux derniers sont des estimations. Déconseillé piano-heavy : fuites, surtout piano. Un masque spectral réduit la fuite dans les autres stems ; le piano n’est pas nettoyé.",
};

const STEMS = ["vocals", "drums", "bass", "other", "guitar", "piano"] as const;

export function mapHtDemucs6sStemIds(ids: string[]): (typeof STEMS)[number][] {
  const lower = ids.map((id) => id.toLowerCase());
  return STEMS.filter((role) => lower.some((id) => id.includes(role)));
}

export class HtDemucs6sStemSeparator implements StemSeparatorProvider {
  readonly capabilities = HTDEMUCS_6S_CAPABILITIES;

  constructor(private readonly transport?: AudiocppSepTransport) {}

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    if (!this.transport) {
      throw new Error(
        "HtDemucs6sStemSeparator requires the local demucs-onnx transport.",
      );
    }
    const audioPath =
      request.separatorInputPath ??
      `${request.outputDir.replace(/\/$/, "")}/input-44100.wav`;
    const { namedStemIds } = await this.transport.runSeparation({
      modelId: HTDEMUCS_6S_PACKAGE.modelId,
      family: HTDEMUCS_6S_PACKAGE.family,
      audioPath44100: audioPath,
      outputDir: request.outputDir,
    });
    const mapped = mapHtDemucs6sStemIds(namedStemIds);
    const missing = STEMS.filter((role) => !mapped.includes(role));
    if (missing.length) {
      throw new Error(
        `HTDemucs 6 stems n’a pas produit : ${missing.join(", ")} (reçus : ${namedStemIds.join(", ")}).`,
      );
    }
    const stems: StemDescriptor[] = [];
    for (const role of STEMS) {
      const path = `${request.outputDir.replace(/\/$/, "")}/${role}-48000.wav`;
      stems.push({
        role,
        path,
        sha256: this.transport.sha256File
          ? await this.transport.sha256File(path)
          : "0".repeat(64),
        reliability: reliabilityForRole(role),
      });
    }
    return {
      family: HTDEMUCS_6S_PACKAGE.family,
      packageId: HTDEMUCS_6S_PACKAGE.packageId,
      separatorInput: {
        path: "input-44100.wav",
        sampleRate: 44100,
        resampler: "ffmpeg-soxr-precision-28",
      },
      stems,
      unavailableRoles: [],
      warnings: [
        "estimated-separation",
        "experimental-guitar-piano",
        "piano-less-reliable",
        "piano-bleed-mask",
      ],
    };
  }
}

export function createHtDemucs6sStemSeparator(
  transport?: AudiocppSepTransport,
): StemSeparatorProvider {
  return new HtDemucs6sStemSeparator(transport);
}
