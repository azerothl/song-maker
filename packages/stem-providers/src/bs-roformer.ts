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
 * BS-RoFormer (`bs_roformer`) via audio.cpp (§23 phase 3).
 *
 * Honest stem layout from audio.cpp docs / model_specs:
 * only `vocals` + derived `instrumental` — NOT drums/bass/guitar/piano.
 * Song Maker maps `instrumental` → role `other` (Accompagnement).
 *
 * Weights are optional (not in the first-build installer). The host must
 * only register this model in audiocpp-server.json when the GGUF exists.
 */
export const BS_ROFORMER_PACKAGE = {
  family: "bs_roformer",
  packageId: "bs_roformer_q8_0",
  modelId: "bs_roformer",
  gguf: "bs-roformer-ep368-q8_0.gguf",
  sha256:
    "9a55a8cad369d00f6e0fb208bb0cd87e30e25430772b8491e20a4eace6423ad2",
  repo: "audio-cpp/audio.cpp-gguf",
  remotePath: "BS-RoFormer-ep368-GGUF/bs-roformer-ep368-q8_0.gguf",
  bytes: 172_532_256,
} as const;

export const BS_ROFORMER_CAPABILITIES: StemSeparatorCapabilities = {
  id: "audiocpp-bs-roformer",
  family: BS_ROFORMER_PACKAGE.family,
  roles: ["vocals", "other"],
  unavailableRoles: ["drums", "bass", "guitar", "piano"],
  marksExtrasLessReliable: false,
  displayNameFr: "BS-RoFormer (voix / instrumental)",
  stemLayoutNoteFr:
    "Deux stems seulement : voix + instrumental (mappé sur Accompagnement). Batterie, basse, guitare et piano indisponibles.",
};

/**
 * Maps audiocpp named outputs → Song Maker roles for BS-RoFormer.
 * `instrumental` becomes `other`.
 */
export function mapBsRoFormerStemIds(namedStemIds: string[]): {
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

/**
 * Live BS-RoFormer adapter. Requires transport + GGUF present on the host.
 */
export class BsRoFormerStemSeparator implements StemSeparatorProvider {
  readonly capabilities = BS_ROFORMER_CAPABILITIES;

  constructor(private readonly transport?: AudiocppSepTransport) {}

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    if (!this.transport) {
      throw new Error(
        "BsRoFormerStemSeparator requires an AudiocppSepTransport and a local bs_roformer GGUF (hors installeur premier build).",
      );
    }
    const audioPath =
      request.separatorInputPath ??
      `${request.outputDir.replace(/\/$/, "")}/input-44100.wav`;
    const { namedStemIds } = await this.transport.runSeparation({
      modelId: BS_ROFORMER_PACKAGE.modelId,
      family: BS_ROFORMER_PACKAGE.family,
      audioPath44100: audioPath,
      outputDir: request.outputDir,
    });

    const mapped = mapBsRoFormerStemIds(namedStemIds);
    if (!mapped.hasVocals || !mapped.hasInstrumental) {
      throw new Error(
        `BS-RoFormer attend vocals + instrumental ; reçus : ${namedStemIds.join(", ") || "(aucun)"}`,
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
      family: BS_ROFORMER_PACKAGE.family,
      packageId: BS_ROFORMER_PACKAGE.packageId,
      gguf: BS_ROFORMER_PACKAGE.gguf,
      sha256: BS_ROFORMER_PACKAGE.sha256,
      separatorInput: {
        path: "input-44100.wav",
        sampleRate: 44100,
        resampler: "ffmpeg-soxr-precision-28",
      },
      stems,
      unavailableRoles: [...BS_ROFORMER_CAPABILITIES.unavailableRoles],
      warnings: [
        "estimated-separation",
        "bs-roformer-vocals-instrumental-only",
        "drums-bass-guitar-piano-unavailable",
      ],
    };
  }
}

/** @deprecated Prefer createBsRoFormerStemSeparator — name kept for foundation callers. */
export class BsRoFormerStemSeparatorStub extends BsRoFormerStemSeparator {
  constructor() {
    super(undefined);
  }
}

export function createBsRoFormerStemSeparator(
  transport?: AudiocppSepTransport,
): StemSeparatorProvider {
  return new BsRoFormerStemSeparator(transport);
}

export function createBsRoFormerStemSeparatorStub(): StemSeparatorProvider {
  return new BsRoFormerStemSeparatorStub();
}
