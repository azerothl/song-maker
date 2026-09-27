import { resolveAuthPlaceholder } from "./auth.js";
import type {
  AuthPlaceholder,
  ConsentRecord,
  RemoteGpuWorkerClient,
  RemoteJobHandle,
  RemoteJobRequest,
  RemoteWorkerPreferences,
  RetentionPolicy,
} from "./types.js";
import {
  DEFAULT_REMOTE_PREFERENCES,
  DEFAULT_RETENTION_POLICY,
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

function rejectRetention(request: RemoteJobRequest): RemoteJobHandle | null {
  if (!request.consent.retentionAcknowledged) {
    return {
      id: "rejected",
      status: "rejected_retention",
      error: DEFAULT_RETENTION_POLICY.messageFr,
    };
  }
  return null;
}

function rejectUnauthorized(auth: AuthPlaceholder): RemoteJobHandle | null {
  if (!auth.accessToken) {
    return {
      id: "rejected",
      status: "rejected_unauthorized",
      error:
        "Auth : aucun jeton. Définir SONG_MAKER_REMOTE_WORKER_TOKEN ou coller un jeton dans Paramètres.",
    };
  }
  return null;
}

/**
 * Local-first client: enforces consent, retention ack, token, TLS.
 * Does not open sockets — queues in memory so the UI can exercise the path
 * without a live worker. Replace transport later without changing the API.
 */
export class LocalFirstRemoteGpuWorkerClient implements RemoteGpuWorkerClient {
  private readonly jobs = new Map<string, RemoteJobHandle>();
  private seq = 0;
  private readonly preferences: RemoteWorkerPreferences;
  readonly retention: RetentionPolicy;

  constructor(
    preferences: Partial<RemoteWorkerPreferences> = {},
    retention: RetentionPolicy = DEFAULT_RETENTION_POLICY,
  ) {
    this.preferences = { ...DEFAULT_REMOTE_PREFERENCES, ...preferences };
    this.retention = retention;
  }

  getPreferences(): RemoteWorkerPreferences {
    return { ...this.preferences };
  }

  async authenticate(placeholder: AuthPlaceholder): Promise<AuthPlaceholder> {
    return resolveAuthPlaceholder({
      accessToken: placeholder.accessToken ?? this.preferences.accessToken,
      expiresAt: placeholder.expiresAt,
    });
  }

  async submit(request: RemoteJobRequest): Promise<RemoteJobHandle> {
    if (this.preferences.localFirst && !this.preferences.remoteEnabled) {
      return {
        id: "rejected",
        status: "rejected_local_only",
        error:
          "Mode local-first (défaut) : activez explicitement le worker distant dans Paramètres.",
      };
    }

    const noConsent = rejectNoConsent(request);
    if (noConsent) return noConsent;
    const retention = rejectRetention(request);
    if (retention) return retention;

    const auth = await this.authenticate(request.auth);
    const unauthorized = rejectUnauthorized(auth);
    if (unauthorized) return unauthorized;

    if (
      request.endpoint.requireTls &&
      !request.endpoint.baseUrl.startsWith("https://")
    ) {
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
        error: "Annulation demandée (pas d’appel réseau — file locale).",
      };
      this.jobs.set(jobId, cancelled);
      return cancelled;
    }
    return job;
  }
}

/** @deprecated Prefer LocalFirstRemoteGpuWorkerClient. */
export class StubRemoteGpuWorkerClient extends LocalFirstRemoteGpuWorkerClient {
  constructor() {
    // Legacy stub tests expect remote path open when consent+token present.
    super({ localFirst: false, remoteEnabled: true });
  }
}

export function createRemoteGpuWorkerClient(
  preferences?: Partial<RemoteWorkerPreferences>,
): LocalFirstRemoteGpuWorkerClient {
  return new LocalFirstRemoteGpuWorkerClient(preferences);
}

export function createEmptyAuthPlaceholder(): AuthPlaceholder {
  return resolveAuthPlaceholder({ accessToken: null });
}

export function createConsent(
  partial: Partial<ConsentRecord> &
    Pick<ConsentRecord, "userConsented" | "scope">,
): ConsentRecord {
  return {
    userConsented: partial.userConsented,
    consentedAt:
      partial.consentedAt ??
      (partial.userConsented ? new Date().toISOString() : null),
    scope: partial.scope,
    retentionAcknowledged: partial.retentionAcknowledged ?? false,
  };
}
