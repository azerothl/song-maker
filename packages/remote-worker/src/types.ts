/**
 * Remote GPU worker — phase 4 (§18.2).
 * Not a VRAM fallback for phase 1 (Q4 / CUDA message remain the answer).
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
};

export type AuthPlaceholder = {
  /** Opaque token placeholder — no real IdP wired yet. */
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
  | "rejected_unauthorized";

export type RemoteJobHandle = {
  id: string;
  status: RemoteJobStatus;
  resultCipher?: EncryptedBlobRef;
  error?: string;
};

/**
 * Client surface for a future remote GPU worker.
 * Files encrypted in transit; nothing sent without consent.
 */
export interface RemoteGpuWorkerClient {
  authenticate(placeholder: AuthPlaceholder): Promise<AuthPlaceholder>;
  submit(request: RemoteJobRequest): Promise<RemoteJobHandle>;
  poll(jobId: string): Promise<RemoteJobHandle>;
  cancel(jobId: string): Promise<RemoteJobHandle>;
}
