import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loraTrainStatusLabelKey,
  resolveLoraTrainRuntimeStatus,
} from "./loraTrainStatus";
import type { LoraTrainerProbe } from "./runtimeHost";

const detectedProbe: LoraTrainerProbe = {
  trainerExists: true,
  trainerScriptPath: "scripts/lora-train-nar.py",
  jobsRoot: "training-jobs",
  pythonAvailable: true,
  messageFr: "Trainer NAR détecté",
};

const missingProbe: LoraTrainerProbe = {
  trainerExists: false,
  trainerScriptPath: null,
  jobsRoot: "training-jobs",
  pythonAvailable: true,
  messageFr: "Aucun script",
};

const noPythonProbe: LoraTrainerProbe = {
  trainerExists: false,
  trainerScriptPath: "scripts/lora-train-nar.py",
  jobsRoot: "training-jobs",
  pythonAvailable: false,
  messageFr: "Python manquant",
};

describe("resolveLoraTrainRuntimeStatus", () => {
  it("never reports stub semantics when the runner script is detected", () => {
    const status = resolveLoraTrainRuntimeStatus({
      hostAvailable: true,
      probe: detectedProbe,
    });
    assert.equal(status, "needs_corpus");
    assert.doesNotMatch(loraTrainStatusLabelKey(status), /stub/i);
  });

  it("distinguishes absent runner, waiting states, ready, and jobs", () => {
    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: missingProbe,
      }),
      "runner_absent",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: noPythonProbe,
      }),
      "python_missing",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        rightsConfirmed: false,
        corpusReady: true,
      }),
      "needs_rights",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        rightsConfirmed: true,
        corpusReady: false,
      }),
      "needs_corpus",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        rightsConfirmed: true,
        corpusReady: true,
      }),
      "ready",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        rightsConfirmed: true,
        corpusReady: true,
        jobStatus: "running",
      }),
      "job_active",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        jobStatus: "failed",
      }),
      "job_failed",
    );

    assert.equal(
      resolveLoraTrainRuntimeStatus({
        hostAvailable: true,
        probe: detectedProbe,
        jobStatus: "completed",
      }),
      "job_completed",
    );
  });
});
