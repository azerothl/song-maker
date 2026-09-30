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
 * Mel-Band RoFormer « Kim Vocal 2 » (`mel_band_roformer`) via audio.cpp.
 *
 * Same honest layout as BS-RoFormer: vocals + instrumental → other.
 * Weights are opt-in (not in the first-build installer).
 */
export const MEL_BAND_ROFORMER_PACKAGE = {
  family: "mel_band_roformer",
  packageId: "mel_band_roformer_q8_0",
  modelId: "mel_band_roformer",
  gguf: "mel-band-roformer-q8_0.gguf",
  sha256:
    "2dd898ceb0e3812c18d6125dcd60174d35d3da22c94add76b029fbb21fc238fd",
  repo: "audio-cpp/audio.cpp-gguf",
  remotePath: "Mel-Band-RoFormer-GGUF/mel-band-roformer-q8_0.gguf",
  bytes: 251_748_928,
  displayNameFr: "Mel-Band RoFormer « Kim Vocal »",
} as const;

export const MEL_BAND_ROFORMER_CAPABILITIES: StemSeparatorCapabilities = {
  id: "audiocpp-mel-band-roformer",
  family: MEL_BAND_ROFORMER_PACKAGE.family,
  roles: ["vocals", "other"],
  unavailableRoles: ["drums", "bass", "guitar", "piano"],
  marksExtrasLessReliable: false,
  displayNameFr: MEL_BAND_ROFORMER_PACKAGE.displayNameFr,
  stemLayoutNoteFr:
    "Deux stems : voix + instrumental (mappé sur Accompagnement). Batterie, basse, guitare et piano indisponibles.",
};

export function mapMelBandRoFormerStemIds(namedStemIds: string[]): {
  roles: StemRole[];
  hasVocals: boolean;
  hasInstrumental: boolean;
} {
  let hasVocals = false;
  let hasInstrumental = false;
  for (const id of namedStemIds) {
    const lower = id.toLowerCase();
    if (lower.includes("vocal")) hasVocals = true;
    if (lower.includes("instrumental") || lower === "other") {
      hasInstrumental = true;
    }
  }
  const roles: StemRole[] = [];
  if (hasVocals) roles.push("vocals");
  if (hasInstrumental) roles.push("other");
  return { roles, hasVocals, hasInstrumental };
}

export class MelBandRoFormerStemSeparator implements StemSeparatorProvider {
  readonly capabilities = MEL_BAND_ROFORMER_CAPABILITIES;

  constructor(private readonly transport?: AudiocppSepTransport) {}

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    if (!this.transport) {
      throw new Error(
        "MelBandRoFormerStemSeparator requires an AudiocppSepTransport and a local mel_band_roformer GGUF (hors installeur premier build).",
      );
    }
    const audioPath =
      request.separatorInputPath ??
      `${request.outputDir.replace(/\/$/, "")}/input-44100.wav`;
    const { namedStemIds } = await this.transport.runSeparation({
      modelId: MEL_BAND_ROFORMER_PACKAGE.modelId,
      family: MEL_BAND_ROFORMER_PACKAGE.family,
      audioPath44100: audioPath,
      outputDir: request.outputDir,
    });

    const mapped = mapMelBandRoFormerStemIds(namedStemIds);
    if (!mapped.hasVocals || !mapped.hasInstrumental) {
      throw new Error(
        `Mel-Band RoFormer attend vocals + instrumental ; reçus : ${namedStemIds.join(", ") || "(aucun)"}`,
      );
    }

    const sha = this.transport.sha256File;
    const stemFiles: Array<{ role: "vocals" | "other"; path: string }> = [
      { role: "vocals", path: "vocals-48000.wav" },
      { role: "other", path: "other-48000.wav" },
    ];
    const stems: StemDescriptor[] = [];
    for (const { role, path } of stemFiles) {
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
      family: MEL_BAND_ROFORMER_PACKAGE.family,
      packageId: MEL_BAND_ROFORMER_PACKAGE.packageId,
      gguf: MEL_BAND_ROFORMER_PACKAGE.gguf,
      sha256: MEL_BAND_ROFORMER_PACKAGE.sha256,
      separatorInput: {
        path: "input-44100.wav",
        sampleRate: 44100,
        resampler: "ffmpeg-soxr-precision-28",
      },
      stems,
      unavailableRoles: [...MEL_BAND_ROFORMER_CAPABILITIES.unavailableRoles],
      warnings: [
        "estimated-separation",
        "bs-roformer-vocals-instrumental-only",
        "drums-bass-guitar-piano-unavailable",
      ],
    };
  }
}

export function createMelBandRoFormerStemSeparator(
  transport?: AudiocppSepTransport,
): StemSeparatorProvider {
  return new MelBandRoFormerStemSeparator(transport);
}
