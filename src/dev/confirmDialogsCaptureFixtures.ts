import type { BuiltRemotePayload } from "@song-maker/remote-worker";
import { INTERNAL_PPQ } from "@song-maker/score-engine";
import type { RemoteWorkerPreferences } from "@song-maker/remote-worker";
import type { ScoreDocument } from "../lib/score";
import { createEmptyScoreDocument } from "../lib/score";
import { captureInvariantBaseline } from "../lib/invariants";

export const CONFIRM_CAPTURE_PROJECT_ID = "capture-confirm-dialogs";

function scoreWithNote(id: string, pitch: number): ScoreDocument {
  const doc = createEmptyScoreDocument({ id });
  const voice = doc.voices[0];
  if (!voice) throw new Error("Voix capture absente");
  voice.notes = [
    {
      id: "n1",
      pitch,
      startTick: 0,
      durationTick: INTERNAL_PPQ,
      velocity: 90,
    },
  ];
  return doc;
}

export function captureRegenerationBefore(): ScoreDocument {
  return scoreWithNote("capture-regen-before", 60);
}

export function captureRegenerationAfterViolations(): ScoreDocument {
  return scoreWithNote("capture-regen-after", 62);
}

export function captureRegenerationAfterOk(): ScoreDocument {
  return scoreWithNote("capture-regen-after-ok", 60);
}

export function prepareRegenerationBaseline(before: ScoreDocument): void {
  captureInvariantBaseline(before, {
    projectId: CONFIRM_CAPTURE_PROJECT_ID,
    level: "exact_pitches",
  });
}

export function captureInvariantScoreDocument(): ScoreDocument {
  const doc = scoreWithNote("capture-invariant-doc", 64);
  captureInvariantBaseline(doc, {
    projectId: CONFIRM_CAPTURE_PROJECT_ID,
    level: "pitches_and_rhythms",
  });
  return doc;
}

export const captureRemotePrefs: RemoteWorkerPreferences = {
  localFirst: true,
  remoteEnabled: true,
  endpointBaseUrl: "https://worker.capture.example/v1",
  accessToken: "capture-token",
  retentionAcknowledged: true,
};

export function captureRemotePayloadPreview(): BuiltRemotePayload {
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ projectId: CONFIRM_CAPTURE_PROJECT_ID, kind: "generate" }),
  );
  return {
    plaintext,
    plaintextSha256: "a".repeat(64),
    blob: {
      cipherPath: "capture/cipher.bin",
      contentSha256: "b".repeat(64),
      encryption: "aes-256-gcm-placeholder",
      byteLength: plaintext.byteLength,
    },
  };
}

export type ConfirmCaptureScenario =
  | "regeneration-gate"
  | "regeneration-gate-keep-ok"
  | "regeneration-gate-keep-violations"
  | "invariant-panel"
  | "remote-generate-confirm"
  | "separation-recommend"
  | "update-notice";

export function parseConfirmCaptureHash(hashRaw: string): ConfirmCaptureScenario {
  const hash = hashRaw.replace(/^#/, "").toLowerCase();
  if (hash.includes("keep-violations") || hash.includes("gate-violations")) {
    return "regeneration-gate-keep-violations";
  }
  if (hash.includes("keep-ok") || hash.includes("gate-keep")) {
    return "regeneration-gate-keep-ok";
  }
  if (hash.includes("invariant")) return "invariant-panel";
  if (hash.includes("remote")) return "remote-generate-confirm";
  if (hash.includes("separation") || hash.includes("sep")) return "separation-recommend";
  if (hash.includes("update")) return "update-notice";
  return "regeneration-gate";
}
