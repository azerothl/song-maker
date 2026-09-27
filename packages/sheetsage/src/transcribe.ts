import { checkSheetsageReadiness } from "./readiness.js";
import {
  REINTERPRETATION_DISCLAIMER_FR,
  type SheetsageCancelHandle,
  type SheetsageRuntimeProbe,
  type SheetsageTranscribeRequest,
  type SheetsageTranscribeResult,
} from "./types.js";

let jobSeq = 0;

function nextJobId(): string {
  jobSeq += 1;
  return `sheetsage-${Date.now()}-${jobSeq}`;
}

export type SheetsageTranscriber = {
  transcribe(
    request: SheetsageTranscribeRequest,
  ): Promise<SheetsageTranscribeResult>;
  /**
   * Optional cancel registration for a running job.
   * Stub jobs finish immediately with not_implemented.
   */
  createCancelHandle?(jobId: string): SheetsageCancelHandle;
};

/**
 * Honest stub: never invents ABC. Returns not_implemented until a real
 * runner is injected and readiness allows an attempt.
 */
export class StubSheetsageTranscriber implements SheetsageTranscriber {
  constructor(private readonly probe: SheetsageRuntimeProbe) {}

  createCancelHandle(jobId: string): SheetsageCancelHandle {
    return {
      jobId,
      cancel: () => {
        /* no-op for stub */
      },
    };
  }

  async transcribe(
    request: SheetsageTranscribeRequest,
  ): Promise<SheetsageTranscribeResult> {
    const jobId = nextJobId();
    const probe: SheetsageRuntimeProbe = {
      ...this.probe,
      licenseAccepted: request.licenseAccepted,
    };
    const readiness = checkSheetsageReadiness(probe);

    request.onProgress?.({
      jobId,
      phase: "queued",
      fraction: 0,
      messageFr: "Vérification SheetSage2…",
    });

    if (request.signal?.aborted) {
      return {
        status: "cancelled",
        jobId,
        abc: null,
        warnings: [],
        messageFr: "Transcription annulée.",
        reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
      };
    }

    if (!request.licenseAccepted || readiness.status === "license_not_accepted") {
      request.onProgress?.({
        jobId,
        phase: "failed",
        fraction: 0,
        messageFr: readiness.messageFr,
      });
      return {
        status: "license_not_accepted",
        jobId,
        abc: null,
        warnings: [],
        messageFr: readiness.messageFr,
        reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
      };
    }

    if (!readiness.canAttemptTranscribe) {
      request.onProgress?.({
        jobId,
        phase: "failed",
        fraction: 0,
        messageFr: readiness.messageFr,
      });
      return {
        status: "missing_runtime",
        jobId,
        abc: null,
        warnings: [readiness.status],
        messageFr: readiness.messageFr,
        reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
      };
    }

    // Binary + weights present, but product still has no wired midi runner.
    request.onProgress?.({
      jobId,
      phase: "failed",
      fraction: 0,
      messageFr:
        "Runtime SheetSage2 détecté mais la transcription n’est pas encore câblée " +
        "(pas d’appel --task midi). Aucune partition fictive n’est inventée.",
    });
    return {
      status: "not_implemented",
      jobId,
      abc: null,
      warnings: ["runner_not_wired"],
      messageFr:
        "Transcription SheetSage2 : non implémentée — binaire/poids éventuels " +
        "présents mais sans câblage produit. Voir docs/sheetsage2-path.md.",
      reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
    };
  }
}

/**
 * Real runner placeholder — only used when an integration injects a callable
 * that actually returns ABC from audio. Not shipped.
 */
export type LiveSheetsageRunner = (
  request: SheetsageTranscribeRequest,
  probe: SheetsageRuntimeProbe,
) => Promise<SheetsageTranscribeResult>;

export class WiredSheetsageTranscriber implements SheetsageTranscriber {
  constructor(
    private readonly probe: SheetsageRuntimeProbe,
    private readonly runner: LiveSheetsageRunner,
  ) {}

  async transcribe(
    request: SheetsageTranscribeRequest,
  ): Promise<SheetsageTranscribeResult> {
    const readiness = checkSheetsageReadiness({
      ...this.probe,
      licenseAccepted: request.licenseAccepted,
    });
    if (!readiness.canAttemptTranscribe) {
      const jobId = nextJobId();
      return {
        status:
          readiness.status === "license_not_accepted"
            ? "license_not_accepted"
            : "missing_runtime",
        jobId,
        abc: null,
        warnings: [readiness.status],
        messageFr: readiness.messageFr,
        reinterpretationDisclaimerFr: REINTERPRETATION_DISCLAIMER_FR,
      };
    }
    return this.runner(request, this.probe);
  }
}

export function createSheetsageTranscriber(
  probe: SheetsageRuntimeProbe,
  runner?: LiveSheetsageRunner,
): SheetsageTranscriber {
  if (runner) return new WiredSheetsageTranscriber(probe, runner);
  return new StubSheetsageTranscriber(probe);
}

/**
 * Gate before YuE2: require non-empty confirmed ABC.
 * Callers must not invoke start_generation until this passes.
 */
export function assertAbcConfirmedForYue2(abc: string | null | undefined): {
  ok: boolean;
  messageFr: string;
} {
  const trimmed = abc?.trim() ?? "";
  if (!trimmed) {
    return {
      ok: false,
      messageFr:
        "Confirmez d’abord la partition ABC proposée avant de lancer YuE2. " +
        "Aucun appel génération sans confirmation.",
    };
  }
  if (!/^X:\s*\d+/m.test(trimmed)) {
    return {
      ok: false,
      messageFr:
        "La partition confirmée ne ressemble pas à de l’ABC (en-tête X: manquant).",
    };
  }
  return { ok: true, messageFr: "Partition confirmée — YuE2 peut être lancé." };
}
