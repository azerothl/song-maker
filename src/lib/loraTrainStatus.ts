import type { LaunchTrainingResult } from "@song-maker/lora-training";
import type fr from "../ui/fr.json";
import type { LoraTrainerProbe } from "./runtimeHost";

type FrKey = keyof typeof fr;

/**
 * Runtime status for the LoRA NAR training settings card and detail panel (#75).
 * Maturity stays “pilote”; never labelled “stub” when a runner script is present.
 */
export type LoraTrainRuntimeStatus =
  | "probing"
  | "host_required"
  | "runner_absent"
  | "python_missing"
  | "needs_rights"
  | "needs_corpus"
  | "ready"
  | "job_active"
  | "job_failed"
  | "job_completed";

export type LoraTrainStatusInput = {
  probing?: boolean;
  hostAvailable: boolean;
  probe: LoraTrainerProbe | null;
  rightsConfirmed?: boolean;
  corpusReady?: boolean;
  jobStatus?: LaunchTrainingResult["status"] | null;
};

export function resolveLoraTrainRuntimeStatus(
  input: LoraTrainStatusInput,
): LoraTrainRuntimeStatus {
  if (input.probing) return "probing";
  if (!input.hostAvailable) return "host_required";

  const probe = input.probe;
  if (!probe) return "probing";

  const scriptPresent = Boolean(probe.trainerScriptPath);
  if (!scriptPresent) return "runner_absent";
  if (!probe.pythonAvailable) return "python_missing";
  if (!probe.trainerExists) return "runner_absent";

  const job = input.jobStatus;
  if (job === "running" || job === "queued") return "job_active";
  if (job === "failed") return "job_failed";
  if (job === "completed") return "job_completed";

  if (input.rightsConfirmed === false) return "needs_rights";
  if (input.corpusReady === false) return "needs_corpus";
  if (input.rightsConfirmed === true && input.corpusReady === true) {
    return "ready";
  }

  // Home card / after restart: runner known, session rights/corpus unknown.
  return "needs_corpus";
}

/** i18n key for the short card / badge label. */
export function loraTrainStatusLabelKey(
  status: LoraTrainRuntimeStatus,
): FrKey {
  switch (status) {
    case "probing":
      return "settings.card.loraTrainStatus.probing";
    case "host_required":
      return "settings.card.loraTrainStatus.hostRequired";
    case "runner_absent":
      return "settings.card.loraTrainStatus.runnerAbsent";
    case "python_missing":
      return "settings.card.loraTrainStatus.pythonMissing";
    case "needs_rights":
      return "settings.card.loraTrainStatus.needsRights";
    case "needs_corpus":
      return "settings.card.loraTrainStatus.needsCorpus";
    case "ready":
      return "settings.card.loraTrainStatus.ready";
    case "job_active":
      return "settings.card.loraTrainStatus.jobActive";
    case "job_failed":
      return "settings.card.loraTrainStatus.jobFailed";
    case "job_completed":
      return "settings.card.loraTrainStatus.jobCompleted";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
