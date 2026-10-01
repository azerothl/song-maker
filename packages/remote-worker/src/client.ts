import { resolveAuthPlaceholder } from "./auth.js";
import {
  createHttpTransport,
  type ArtifactDownloadResult,
  type RemoteHttpTransport,
} from "./http-transport.js";
import type {
  AuthPlaceholder,
  ConsentRecord,
  RemoteArtifactName,
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

export type LocalFirstRemoteGpuWorkerClientOptions = {
  preferences?: Partial<RemoteWorkerPreferences>;
  retention?: RetentionPolicy;
  /**
   * When true (default if remoteEnabled), use HTTP transport against the
   * documented contract. When false, keep an in-memory queue for unit tests.
   */
  useHttpTransport?: boolean;
  transport?: RemoteHttpTransport;
};

/**
 * Local-first client: enforces consent, retention ack, token, TLS.
 * When remote is opted in, submits via HTTP to the contract endpoints.
 * Opt-out (`remoteEnabled=false`) → zero remote calls (no sockets, no fetch).
 * Failures are loud — no silent local generation fallback.
 */
export class LocalFirstRemoteGpuWorkerClient implements RemoteGpuWorkerClient {
  private readonly jobs = new Map<string, RemoteJobHandle>();
  private seq = 0;
  private readonly preferences: RemoteWorkerPreferences;
  readonly retention: RetentionPolicy;
  private readonly useHttp: boolean;
  private readonly transport: RemoteHttpTransport;

  constructor(
    preferences: Partial<RemoteWorkerPreferences> = {},
    retention: RetentionPolicy = DEFAULT_RETENTION_POLICY,
    options: Omit<
      LocalFirstRemoteGpuWorkerClientOptions,
      "preferences" | "retention"
    > = {},
  ) {
    this.preferences = { ...DEFAULT_REMOTE_PREFERENCES, ...preferences };
    this.retention = retention;
    this.useHttp =
      options.useHttpTransport ??
      (this.preferences.remoteEnabled &&
        Boolean(this.preferences.endpointBaseUrl.trim()));
    this.transport = options.transport ?? createHttpTransport();
  }

  getPreferences(): RemoteWorkerPreferences {
    return { ...this.preferences };
  }

  /** True when this client will never open a network call (opt-out). */
  isNetworkIdle(): boolean {
    return !this.preferences.remoteEnabled;
  }

  async authenticate(placeholder: AuthPlaceholder): Promise<AuthPlaceholder> {
    return resolveAuthPlaceholder({
      accessToken: placeholder.accessToken ?? this.preferences.accessToken,
      expiresAt: placeholder.expiresAt,
    });
  }

  private endpoint() {
    const base = this.preferences.endpointBaseUrl;
    const localHttp =
      base.startsWith("http://127.0.0.1") || base.startsWith("http://localhost");
    return {
      baseUrl: base,
      requireTls: !localHttp,
    };
  }

  async submit(request: RemoteJobRequest): Promise<RemoteJobHandle> {
    if (this.preferences.localFirst && !this.preferences.remoteEnabled) {
      return {
        id: "rejected",
        status: "rejected_local_only",
        error:
          "Mode local-first (défaut) : activez explicitement le worker distant dans Paramètres. Aucun appel réseau.",
      };
    }

    const noConsent = rejectNoConsent(request);
    if (noConsent) return noConsent;
    const retention = rejectRetention(request);
    if (retention) return retention;

    const auth = await this.authenticate(request.auth);
    const unauthorized = rejectUnauthorized(auth);
    if (unauthorized) return unauthorized;

    const requireTls = request.endpoint.requireTls;
    const base = request.endpoint.baseUrl;
    const localHttp =
      base.startsWith("http://127.0.0.1") || base.startsWith("http://localhost");
    if (requireTls && !base.startsWith("https://") && !localHttp) {
      return {
        id: "rejected",
        status: "failed",
        error: "TLS requis pour un worker distant (fichiers chiffrés en transit).",
      };
    }

    if (this.useHttp) {
      const result = await this.transport.submitJob({ ...request, auth });
      this.jobs.set(result.handle.id, result.handle);
      return result.handle;
    }

    this.seq += 1;
    const handle: RemoteJobHandle = {
      id: `remote-job-${this.seq}`,
      status: "queued",
      error:
        "File mémoire locale (pas de socket). Configurez un endpoint https conforme à docs/remote-worker-contract.md pour un vrai transfert.",
    };
    this.jobs.set(handle.id, handle);
    return handle;
  }

  async poll(jobId: string): Promise<RemoteJobHandle> {
    if (this.useHttp && this.preferences.remoteEnabled) {
      const auth = await this.authenticate({
        scheme: "bearer_placeholder",
        accessToken: this.preferences.accessToken,
        expiresAt: null,
      });
      const result = await this.transport.pollJob(this.endpoint(), auth, jobId);
      this.jobs.set(jobId, result.handle);
      return result.handle;
    }
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
    if (this.useHttp && this.preferences.remoteEnabled) {
      const auth = await this.authenticate({
        scheme: "bearer_placeholder",
        accessToken: this.preferences.accessToken,
        expiresAt: null,
      });
      const result = await this.transport.cancelJob(
        this.endpoint(),
        auth,
        jobId,
      );
      this.jobs.set(jobId, result.handle);
      return result.handle;
    }
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

  async downloadArtifact(
    jobId: string,
    name: RemoteArtifactName,
  ): Promise<ArtifactDownloadResult> {
    if (!this.useHttp || !this.preferences.remoteEnabled) {
      return {
        ok: false,
        error: "Téléchargement d’artefact indisponible hors transport HTTP.",
      };
    }
    const auth = await this.authenticate({
      scheme: "bearer_placeholder",
      accessToken: this.preferences.accessToken,
      expiresAt: null,
    });
    return this.transport.downloadArtifact(
      this.endpoint(),
      auth,
      jobId,
      name,
    );
  }

  async probe(): Promise<RemoteJobHandle> {
    if (!this.preferences.remoteEnabled) {
      return {
        id: "probe",
        status: "rejected_local_only",
        error: "Worker distant désactivé — aucun appel réseau (opt-out).",
      };
    }
    const auth = await this.authenticate({
      scheme: "bearer_placeholder",
      accessToken: this.preferences.accessToken,
      expiresAt: null,
    });
    const unauthorized = rejectUnauthorized(auth);
    if (unauthorized) return { ...unauthorized, id: "probe" };
    if (!this.preferences.endpointBaseUrl.trim()) {
      return {
        id: "probe",
        status: "failed",
        error:
          "URL manquante. L’endpoint doit implémenter GET /v1/health (docs/remote-worker-contract.md).",
      };
    }
    if (!this.preferences.retentionAcknowledged) {
      return {
        id: "probe",
        status: "rejected_retention",
        error: DEFAULT_RETENTION_POLICY.messageFr,
      };
    }
    const result = await this.transport.probeHealth(this.endpoint(), auth);
    return result.handle;
  }
}

/** @deprecated Prefer LocalFirstRemoteGpuWorkerClient. */
export class StubRemoteGpuWorkerClient extends LocalFirstRemoteGpuWorkerClient {
  constructor() {
    super({ localFirst: false, remoteEnabled: true }, DEFAULT_RETENTION_POLICY, {
      useHttpTransport: false,
    });
  }
}

export function createRemoteGpuWorkerClient(
  preferences?: Partial<RemoteWorkerPreferences>,
  options?: Omit<LocalFirstRemoteGpuWorkerClientOptions, "preferences">,
): LocalFirstRemoteGpuWorkerClient {
  const ctorOpts: Omit<
    LocalFirstRemoteGpuWorkerClientOptions,
    "preferences" | "retention"
  > = {};
  if (options?.useHttpTransport !== undefined) {
    ctorOpts.useHttpTransport = options.useHttpTransport;
  }
  if (options?.transport !== undefined) {
    ctorOpts.transport = options.transport;
  }
  return new LocalFirstRemoteGpuWorkerClient(
    preferences,
    options?.retention ?? DEFAULT_RETENTION_POLICY,
    ctorOpts,
  );
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
