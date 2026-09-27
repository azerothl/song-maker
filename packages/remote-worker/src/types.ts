/**
 * Remote GPU worker — phase 4 (§18.2).
 * Not a VRAM fallback for phase 1 (Q4 / CUDA message remain the answer).
 * Local-first remains the product default.
 */

export type RemoteWorkerEndpoint = {
  baseUrl: string;
  /** TLS required in production; localhost may use http in tests only. */
  requireTls: boolean;
};

export type ConsentRecord = {
  /** User explicitly allowed sending this project payload off-device. */
  userConsented: boolean;
  consentedAt: string | null;
  scope: "generation" | "separation" | "both";
  /** User acknowledged retention / deletion messaging before send. */
  retentionAcknowledged: boolean;
};

export type AuthPlaceholder = {
  /**
   * Opaque bearer token — usable via env `SONG_MAKER_REMOTE_WORKER_TOKEN`
   * or Settings. No real IdP wired yet.
   */
  scheme: "bearer_placeholder";
  accessToken: string | null;
  expiresAt: string | null;
};

export type EncryptedBlobRef = {
  /** Ciphertext path or object key; plaintext never leaves without consent. */
  cipherPath: string;
  contentSha256: string;
  encryption: "aes-256-gcm-placeholder";
};

export type RemoteJobKind = "yue2_generate" | "htdemucs_separate";

export type RemoteJobRequest = {
  kind: RemoteJobKind;
  endpoint: RemoteWorkerEndpoint;
  auth: AuthPlaceholder;
  consent: ConsentRecord;
  payload: EncryptedBlobRef;
};

export type RemoteJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected_no_consent"
  | "rejected_unauthorized"
  | "rejected_retention"
  | "rejected_local_only";

export type RemoteJobHandle = {
  id: string;
  status: RemoteJobStatus;
  resultCipher?: EncryptedBlobRef;
  error?: string;
};

export type RetentionPolicy = {
  /** French copy shown before enabling remote send. */
  messageFr: string;
  /** Max retention hours advertised to the user (product promise). */
  maxRetentionHours: number;
  /** Worker deletes ciphertext after successful download when true. */
  deleteAfterDownload: boolean;
};

/** Spec-aligned retention messaging (§18.2 — nothing without consent). */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  messageFr:
    "Worker distant (opt-in) : les fichiers partent chiffrés en transit. " +
    "Rien n’est envoyé sans votre consentement explicite. " +
    "Rétention maximale 24 h côté worker ; suppression après téléchargement du résultat. " +
    "Le mode local (audiocpp sur cette machine) reste le défaut.",
  maxRetentionHours: 24,
  deleteAfterDownload: true,
};

export type RemoteWorkerPreferences = {
  /** Product default: true — never route to remote unless user opts in. */
  localFirst: boolean;
  /** Explicit opt-in to allow remote GPU jobs. */
  remoteEnabled: boolean;
  endpointBaseUrl: string;
  /** Token may also come from SONG_MAKER_REMOTE_WORKER_TOKEN. */
  accessToken: string | null;
  retentionAcknowledged: boolean;
};

export const DEFAULT_REMOTE_PREFERENCES: RemoteWorkerPreferences = {
  localFirst: true,
  remoteEnabled: false,
  endpointBaseUrl: "",
  accessToken: null,
  retentionAcknowledged: false,
};

/**
 * Client surface for a remote GPU worker.
 * Files encrypted in transit; nothing sent without consent.
 */
export interface RemoteGpuWorkerClient {
  authenticate(placeholder: AuthPlaceholder): Promise<AuthPlaceholder>;
  submit(request: RemoteJobRequest): Promise<RemoteJobHandle>;
  poll(jobId: string): Promise<RemoteJobHandle>;
  cancel(jobId: string): Promise<RemoteJobHandle>;
}
