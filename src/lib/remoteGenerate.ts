/**
 * SongScreen helpers for remote generation (#36 / #65).
 * Opt-out → never call these. Failures must not silently start local generation.
 */
import {
  buildProjectPayload,
  bytesToBase64,
  createConsent,
  createRemoteGpuWorkerClient,
  resolveAuthPlaceholder,
  sha256Hex,
  type BuiltRemotePayload,
  type RemoteJobHandle,
  type RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import { api } from "./api";
import type { FormInput } from "./types";
import { generationLyrics } from "./generationLyrics";

export const REMOTE_PREFS_KEY = "song-maker.remote-worker.prefs";

export function loadRemotePrefs(): RemoteWorkerPreferences {
  try {
    const raw = localStorage.getItem(REMOTE_PREFS_KEY);
    if (!raw) {
      return {
        localFirst: true,
        remoteEnabled: false,
        endpointBaseUrl: "",
        accessToken: null,
        retentionAcknowledged: false,
      };
    }
    return { ...JSON.parse(raw), localFirst: true } as RemoteWorkerPreferences;
  } catch {
    return {
      localFirst: true,
      remoteEnabled: false,
      endpointBaseUrl: "",
      accessToken: null,
      retentionAcknowledged: false,
    };
  }
}

function endpointRequireTls(baseUrl: string): boolean {
  return !(
    baseUrl.startsWith("http://127.0.0.1") ||
    baseUrl.startsWith("http://localhost")
  );
}

export async function buildGenerationPayload(
  projectId: string,
  form: FormInput,
  abc?: string | null,
  accessToken?: string | null,
): Promise<BuiltRemotePayload> {
  return buildProjectPayload({
    projectId,
    kind: "yue2_generate",
    accessToken: accessToken ?? null,
    request: {
      title: form.title,
      style: form.style,
      lyrics: generationLyrics(form),
      cot: form.cot,
      seed: form.seed ?? null,
      targetDurationSec: form.targetDurationSec,
      preferFullLyrics: form.preferFullLyrics && !form.instrumentalMode,
      instrumentalMode: form.instrumentalMode,
      hasAbc: Boolean(abc),
    },
    artifacts: {
      lyrics: generationLyrics(form),
      ...(abc ? { abc } : {}),
    },
  });
}

/**
 * Submit after RemoteGenerateConfirm. Throws / returns failed handle —
 * caller must NOT fall back to local startGeneration unless the user asks.
 */
export async function submitRemoteGeneration(
  prefs: RemoteWorkerPreferences,
  payload: BuiltRemotePayload,
): Promise<RemoteJobHandle> {
  if (!prefs.remoteEnabled) {
    return {
      id: "rejected",
      status: "rejected_local_only",
      error: "Worker distant désactivé — aucun appel réseau.",
    };
  }
  const auth = resolveAuthPlaceholder({ accessToken: prefs.accessToken });
  const client = createRemoteGpuWorkerClient({
    localFirst: true,
    remoteEnabled: true,
    endpointBaseUrl: prefs.endpointBaseUrl,
    accessToken: auth.accessToken,
    retentionAcknowledged: prefs.retentionAcknowledged,
  });
  return client.submit({
    kind: "yue2_generate",
    endpoint: {
      baseUrl: prefs.endpointBaseUrl,
      requireTls: endpointRequireTls(prefs.endpointBaseUrl),
    },
    auth,
    consent: createConsent({
      userConsented: true,
      scope: "generation",
      retentionAcknowledged: prefs.retentionAcknowledged,
    }),
    payload: payload.blob,
  });
}

export type RemoteRunOutcome =
  | {
      ok: true;
      jobId: string;
      generationId: string;
      audioSha256: string;
      status: string;
    }
  | { ok: false; jobId: string; status: string; error: string };

/**
 * Submit → poll → download artifacts → import into the local project.
 * Never starts a local YuE2 generation on failure.
 */
export async function runRemoteGenerationToProject(
  projectId: string,
  prefs: RemoteWorkerPreferences,
  payload: BuiltRemotePayload,
  options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    onStatus?: (handle: RemoteJobHandle) => void;
  },
): Promise<RemoteRunOutcome> {
  const auth = resolveAuthPlaceholder({ accessToken: prefs.accessToken });
  const client = createRemoteGpuWorkerClient({
    localFirst: true,
    remoteEnabled: true,
    endpointBaseUrl: prefs.endpointBaseUrl,
    accessToken: auth.accessToken,
    retentionAcknowledged: prefs.retentionAcknowledged,
  });

  const submitted = await client.submit({
    kind: "yue2_generate",
    endpoint: {
      baseUrl: prefs.endpointBaseUrl,
      requireTls: endpointRequireTls(prefs.endpointBaseUrl),
    },
    auth,
    consent: createConsent({
      userConsented: true,
      scope: "generation",
      retentionAcknowledged: prefs.retentionAcknowledged,
    }),
    payload: payload.blob,
  });
  options?.onStatus?.(submitted);

  if (
    submitted.status !== "queued" &&
    submitted.status !== "running" &&
    submitted.status !== "succeeded"
  ) {
    return {
      ok: false,
      jobId: submitted.id,
      status: submitted.status,
      error: submitted.error ?? "soumission distante refusée",
    };
  }

  const pollInterval = options?.pollIntervalMs ?? 750;
  const timeoutMs = options?.timeoutMs ?? 30 * 60_000;
  const started = Date.now();
  let handle = submitted;

  while (
    handle.status === "queued" ||
    handle.status === "running"
  ) {
    if (Date.now() - started > timeoutMs) {
      return {
        ok: false,
        jobId: handle.id,
        status: handle.status,
        error: "Délai dépassé en attendant le worker distant — pas de repli local.",
      };
    }
    await new Promise((r) => setTimeout(r, pollInterval));
    handle = await client.poll(handle.id);
    options?.onStatus?.(handle);
  }

  if (handle.status !== "succeeded") {
    return {
      ok: false,
      jobId: handle.id,
      status: handle.status,
      error: handle.error ?? "échec distant",
    };
  }

  const audio = await client.downloadArtifact(handle.id, "audio.wav");
  if (!audio.ok) {
    return {
      ok: false,
      jobId: handle.id,
      status: "failed",
      error: audio.error,
    };
  }
  const localAudioSha = await sha256Hex(audio.bytes);
  if (audio.sha256 && audio.sha256 !== localAudioSha) {
    return {
      ok: false,
      jobId: handle.id,
      status: "failed",
      error: `Artefact corrompu: sha worker=${audio.sha256} local=${localAudioSha}`,
    };
  }

  const score = await client.downloadArtifact(handle.id, "score.abc");
  const scoreAbc =
    score.ok ? new TextDecoder().decode(score.bytes) : null;

  const imported = await api.importRemoteGeneration(projectId, {
    remoteJobId: handle.id,
    audioBase64: bytesToBase64(audio.bytes),
    audioSha256: localAudioSha,
    scoreAbc,
    scoreSha256: score.ok ? score.sha256 || null : null,
    endpointBaseUrl: prefs.endpointBaseUrl,
    payloadSha256: payload.plaintextSha256,
  });

  return {
    ok: true,
    jobId: handle.id,
    generationId: imported.generationId,
    audioSha256: localAudioSha,
    status: "succeeded",
  };
}
