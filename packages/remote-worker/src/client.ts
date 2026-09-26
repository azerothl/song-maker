import type {
  AuthPlaceholder,
  ConsentRecord,
  RemoteGpuWorkerClient,
  RemoteJobHandle,
  RemoteJobRequest,
} from "./types.js";

function rejectNoConsent(request: RemoteJobRequest): RemoteJobHandle | null {
  if (!request.consent.userConsented) {
    return {
      id: "rejected",
      status: "rejected_no_consent",
      error:
        "Rien n’est envoyé sans consentement explicite (§18.2). Consentement utilisateur requis.",
    };
  }
  return null;
}

function rejectUnauthorized(auth: AuthPlaceholder): RemoteJobHandle | null {
  if (!auth.accessToken) {
    return {
      id: "rejected",
      status: "rejected_unauthorized",
      error: "Auth placeholder : aucun jeton. Brancher un IdP en phase 4.",
    };
  }
  return null;
}

/**
 * In-memory stub: enforces consent + token presence, does not open sockets.
 */
export class StubRemoteGpuWorkerClient implements RemoteGpuWorkerClient {
  private readonly jobs = new Map<string, RemoteJobHandle>();
  private seq = 0;

  async authenticate(placeholder: AuthPlaceholder): Promise<AuthPlaceholder> {
    if (!placeholder.accessToken) {
      return {
        scheme: "bearer_placeholder",
        accessToken: null,
        expiresAt: null,
      };
    }
    return {
      scheme: "bearer_placeholder",
      accessToken: placeholder.accessToken,
      expiresAt:
        placeholder.expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  async submit(request: RemoteJobRequest): Promise<RemoteJobHandle> {
    const noConsent = rejectNoConsent(request);
    if (noConsent) {
      return noConsent;
    }
    const unauthorized = rejectUnauthorized(request.auth);
    if (unauthorized) {
      return unauthorized;
    }
    if (request.endpoint.requireTls && !request.endpoint.baseUrl.startsWith("https://")) {
      return {
        id: "rejected",
        status: "failed",
        error: "TLS requis pour un worker distant (fichiers chiffrés en transit).",
      };
    }

    this.seq += 1;
    const handle: RemoteJobHandle = {
      id: `remote-job-${this.seq}`,
      status: "queued",
    };
    this.jobs.set(handle.id, handle);
    return handle;
  }

  async poll(jobId: string): Promise<RemoteJobHandle> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return {
        id: jobId,
        status: "failed",
        error: `Job inconnu: ${jobId}`,
      };
    }
    return job;
  }

  async cancel(jobId: string): Promise<RemoteJobHandle> {
    const job = await this.poll(jobId);
    if (job.status === "queued" || job.status === "running") {
      const cancelled: RemoteJobHandle = {
        ...job,
        status: "failed",
        error: "Annulation demandée (stub local, pas d’appel réseau).",
      };
      this.jobs.set(jobId, cancelled);
      return cancelled;
    }
    return job;
  }
}

export function createRemoteGpuWorkerClient(): RemoteGpuWorkerClient {
  return new StubRemoteGpuWorkerClient();
}

export function createEmptyAuthPlaceholder(): AuthPlaceholder {
  return {
    scheme: "bearer_placeholder",
    accessToken: null,
    expiresAt: null,
  };
}

export function createConsent(
  partial: Partial<ConsentRecord> & Pick<ConsentRecord, "userConsented" | "scope">,
): ConsentRecord {
  return {
    userConsented: partial.userConsented,
    consentedAt: partial.consentedAt ?? (partial.userConsented ? new Date().toISOString() : null),
    scope: partial.scope,
  };
}
