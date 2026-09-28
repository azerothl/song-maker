import {
  SHEETSAGE2_LICENSE,
  SHEETSAGE2_WEIGHTS,
  type SheetsageAcceleration,
  type SheetsageReadiness,
  type SheetsageRuntimeProbe,
} from "./types.js";

const MIN_DISK_BYTES = SHEETSAGE2_WEIGHTS.byteLength + 512 * 1024 * 1024;

/**
 * Evaluate whether SheetSage2 can be offered / run.
 * Does not download weights; installer does not ship SheetSage2.
 */
export function checkSheetsageReadiness(
  probe: SheetsageRuntimeProbe,
): SheetsageReadiness {
  const acceleration: SheetsageAcceleration = probe.acceleration ?? "unknown";

  if (!probe.licenseAccepted) {
    return {
      status: "license_not_accepted",
      ok: false,
      license: SHEETSAGE2_LICENSE,
      weights: SHEETSAGE2_WEIGHTS,
      acceleration,
      // Status only — panel shows REINTERPRETATION_DISCLAIMER_FR once separately.
      messageFr:
        "Licence CC BY-NC 4.0 SheetSage2 non acceptée. " +
        "Usage commercial des poids interdit.",
      canAttemptTranscribe: false,
    };
  }

  if (
    probe.diskBytesAvailable != null &&
    probe.diskBytesAvailable < MIN_DISK_BYTES
  ) {
    return {
      status: "insufficient_disk",
      ok: false,
      license: SHEETSAGE2_LICENSE,
      weights: SHEETSAGE2_WEIGHTS,
      acceleration,
      messageFr: `Espace disque insuffisant pour SheetSage2 (~${Math.ceil(MIN_DISK_BYTES / 1e9)} Go recommandés).`,
      canAttemptTranscribe: false,
    };
  }

  if (!probe.binaryPresent) {
    return {
      status: "missing_binary",
      ok: false,
      license: SHEETSAGE2_LICENSE,
      weights: SHEETSAGE2_WEIGHTS,
      acceleration,
      messageFr:
        "Binaire audio.cpp avec --task midi --family sheetsage2 introuvable. " +
        "SheetSage2 n’est pas dans l’installeur. Voir docs/sheetsage2-path.md.",
      canAttemptTranscribe: false,
    };
  }

  if (!probe.weightsPresent) {
    return {
      status: "missing_weights",
      ok: false,
      license: SHEETSAGE2_LICENSE,
      weights: SHEETSAGE2_WEIGHTS,
      acceleration,
      messageFr:
        `Poids SheetSage2 absents (${SHEETSAGE2_WEIGHTS.filename}, ` +
        `SHA-256 ${SHEETSAGE2_WEIGHTS.sha256.slice(0, 12)}…). ` +
        "Téléchargement opt-in hors installeur requis.",
      canAttemptTranscribe: false,
    };
  }

  return {
    status: "ready",
    ok: true,
    license: SHEETSAGE2_LICENSE,
    weights: SHEETSAGE2_WEIGHTS,
    acceleration,
    messageFr:
      "Dépendances SheetSage2 détectées — prêt pour transcription " +
      "(audiocpp_cli --task midi --family sheetsage2 ou serveur).",
    canAttemptTranscribe: true,
  };
}

/** Default probe for the shipped app: nothing SheetSage2-related is installed. */
export function defaultSheetsageProbe(
  partial?: Partial<SheetsageRuntimeProbe>,
): SheetsageRuntimeProbe {
  return {
    binaryPresent: false,
    binaryPath: null,
    weightsPresent: false,
    weightsPath: null,
    weightsSha256Verified: false,
    licenseAccepted: false,
    diskBytesAvailable: null,
    acceleration: "unknown",
    ...partial,
  };
}
