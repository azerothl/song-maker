import type {
  AuthPlaceholder,
  EncryptedBlobRef,
  RemoteJobHandle,
  RemoteJobRequest,
  RemoteWorkerEndpoint,
} from "./types.js";

/**
 * HTTP contract paths — see docs/remote-worker-contract.md.
 * This transport is honest: it performs real fetch calls when an endpoint
 * is configured. Without a worker implementing the contract, calls fail
 * loudly. Opt-out (remoteEnabled=false) must never instantiate this path.
 */
export const REMOTE_WORKER_PATHS = {
  health: "/v1/health",
  jobs: "/v1/jobs",
  job: (id: string) => `/v1/jobs/${encodeURIComponent(id)}`,
  cancel: (id: string) => `/v1/jobs/${encodeURIComponent(id)}/cancel`,
} as const;

export type HttpTransportResult =
  | { ok: true; handle: RemoteJobHandle }
  | { ok: false; handle: RemoteJobHandle };

export interface RemoteHttpTransport {
  probeHealth(endpoint: RemoteWorkerEndpoint, auth: AuthPlaceholder): Promise<HttpTransportResult>;
  submitJob(request: RemoteJobRequest): Promise<HttpTransportResult>;
  pollJob(
    endpoint: RemoteWorkerEndpoint,
    auth: AuthPlaceholder,
    jobId: string,
  ): Promise<HttpTransportResult>;
  cancelJob(
    endpoint: RemoteWorkerEndpoint,
    auth: AuthPlaceholder,
    jobId: string,
  ): Promise<HttpTransportResult>;
}

function authHeaders(auth: AuthPlaceholder): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return headers;
}

function fail(id: string, error: string): HttpTransportResult {
  return {
    ok: false,
    handle: { id, status: "failed", error },
  };
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

/**
 * Fetch-based transport. Requires a worker that implements the contract.
 * No silent local fallback — errors surface as failed handles.
 */
export class FetchRemoteHttpTransport implements RemoteHttpTransport {
  async probeHealth(
    endpoint: RemoteWorkerEndpoint,
    auth: AuthPlaceholder,
  ): Promise<HttpTransportResult> {
    if (!endpoint.baseUrl.trim()) {
      return fail(
        "probe",
        "Aucun endpoint configuré. Indiquez une URL https qui implémente docs/remote-worker-contract.md.",
      );
    }
    if (endpoint.requireTls && !endpoint.baseUrl.startsWith("https://")) {
      return fail("probe", "TLS requis (https://) pour le worker distant.");
    }
    try {
      const url = new URL(REMOTE_WORKER_PATHS.health, endpoint.baseUrl.replace(/\/?$/, "/"));
      const res = await fetch(url, { method: "GET", headers: authHeaders(auth) });
      if (!res.ok) {
        return fail(
          "probe",
          `Health HTTP ${res.status} — l’endpoint doit exposer GET ${REMOTE_WORKER_PATHS.health} (contrat).`,
        );
      }
      return {
        ok: true,
        handle: { id: "probe", status: "succeeded" },
      };
    } catch (e) {
      return fail(
        "probe",
        `Health injoignable (${e instanceof Error ? e.message : String(e)}). ` +
          "Pas de repli local silencieux — configurez un worker conforme au contrat.",
      );
    }
  }

  async submitJob(request: RemoteJobRequest): Promise<HttpTransportResult> {
    const { endpoint, auth, payload } = request;
    if (!endpoint.baseUrl.trim()) {
      return fail(
        "rejected",
        "Aucun endpoint worker. Voir docs/remote-worker-contract.md — aucun envoi local de secours.",
      );
    }
    if (endpoint.requireTls && !endpoint.baseUrl.startsWith("https://")) {
      return fail("rejected", "TLS requis (https://) pour le worker distant.");
    }
    try {
      const url = new URL(REMOTE_WORKER_PATHS.jobs, endpoint.baseUrl.replace(/\/?$/, "/"));
      const payloadRef: EncryptedBlobRef = {
        cipherPath: payload.cipherPath,
        contentSha256: payload.contentSha256,
        encryption: payload.encryption,
      };
      if (payload.byteLength !== undefined) {
        payloadRef.byteLength = payload.byteLength;
      }
      const body: Record<string, unknown> = {
        kind: request.kind,
        consent: request.consent,
        payload: payloadRef,
      };
      const extended = payload as EncryptedBlobRef & {
        ciphertextBase64?: string;
      };
      if (extended.ciphertextBase64 !== undefined) {
        body.ciphertextBase64 = extended.ciphertextBase64;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(auth),
        body: JSON.stringify(body),
      });
      const json = (await parseJson(res)) as {
        id?: string;
        status?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        return fail(
          json?.id ?? "rejected",
          json?.error ??
            `Submit HTTP ${res.status} — POST ${REMOTE_WORKER_PATHS.jobs} requis (contrat).`,
        );
      }
      const handle: RemoteJobHandle = {
        id: json?.id ?? `remote-${Date.now()}`,
        status: (json?.status as RemoteJobHandle["status"]) ?? "queued",
      };
      if (json?.error !== undefined) {
        handle.error = json.error;
      }
      return { ok: true, handle };
    } catch (e) {
      return fail(
        "rejected",
        `Submit injoignable (${e instanceof Error ? e.message : String(e)}). ` +
          "Échec explicite — génération locale non lancée automatiquement.",
      );
    }
  }

  async pollJob(
    endpoint: RemoteWorkerEndpoint,
    auth: AuthPlaceholder,
    jobId: string,
  ): Promise<HttpTransportResult> {
    try {
      const url = new URL(
        REMOTE_WORKER_PATHS.job(jobId),
        endpoint.baseUrl.replace(/\/?$/, "/"),
      );
      const res = await fetch(url, { method: "GET", headers: authHeaders(auth) });
      const json = (await parseJson(res)) as {
        id?: string;
        status?: string;
        error?: string;
        resultCipher?: EncryptedBlobRef;
      } | null;
      if (!res.ok) {
        return fail(
          jobId,
          json?.error ?? `Poll HTTP ${res.status} — GET ${REMOTE_WORKER_PATHS.job(":id")} requis.`,
        );
      }
      const handle: RemoteJobHandle = {
        id: json?.id ?? jobId,
        status: (json?.status as RemoteJobHandle["status"]) ?? "running",
      };
      if (json?.resultCipher !== undefined) {
        handle.resultCipher = json.resultCipher;
      }
      if (json?.error !== undefined) {
        handle.error = json.error;
      }
      return { ok: true, handle };
    } catch (e) {
      return fail(
        jobId,
        `Poll injoignable (${e instanceof Error ? e.message : String(e)}).`,
      );
    }
  }

  async cancelJob(
    endpoint: RemoteWorkerEndpoint,
    auth: AuthPlaceholder,
    jobId: string,
  ): Promise<HttpTransportResult> {
    try {
      const url = new URL(
        REMOTE_WORKER_PATHS.cancel(jobId),
        endpoint.baseUrl.replace(/\/?$/, "/"),
      );
      const res = await fetch(url, { method: "POST", headers: authHeaders(auth) });
      const json = (await parseJson(res)) as {
        id?: string;
        status?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        return fail(jobId, json?.error ?? `Cancel HTTP ${res.status}`);
      }
      const handle: RemoteJobHandle = {
        id: json?.id ?? jobId,
        status: (json?.status as RemoteJobHandle["status"]) ?? "failed",
        error: json?.error ?? "cancelled",
      };
      return { ok: true, handle };
    } catch (e) {
      return fail(
        jobId,
        `Cancel injoignable (${e instanceof Error ? e.message : String(e)}).`,
      );
    }
  }
}

export function createHttpTransport(): RemoteHttpTransport {
  return new FetchRemoteHttpTransport();
}
