/**
 * SongScreen helpers for remote generation (#36).
 * Opt-out → never call these. Failures must not silently start local generation.
 */
import {
  buildProjectPayload,
  createConsent,
  createRemoteGpuWorkerClient,
  resolveAuthPlaceholder,
  type BuiltRemotePayload,
  type RemoteJobHandle,
  type RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import type { FormInput } from "./types";

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

export async function buildGenerationPayload(
  projectId: string,
  form: FormInput,
  abc?: string | null,
): Promise<BuiltRemotePayload> {
  return buildProjectPayload({
    projectId,
    kind: "yue2_generate",
    request: {
      title: form.title,
      style: form.style,
      lyrics: form.lyrics,
      cot: form.cot,
      seed: form.seed ?? null,
      targetDurationSec: form.targetDurationSec,
      preferFullLyrics: form.preferFullLyrics,
      hasAbc: Boolean(abc),
    },
    artifacts: {
      lyrics: form.lyrics,
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
      requireTls: true,
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
