export type {
  RemoteWorkerEndpoint,
  ConsentRecord,
  AuthPlaceholder,
  EncryptedBlobRef,
  RemoteJobKind,
  RemoteJobRequest,
  RemoteJobStatus,
  RemoteJobHandle,
  RemoteGpuWorkerClient,
  RemoteArtifactName,
  RetentionPolicy,
  RemoteWorkerPreferences,
} from "./types.js";
export {
  DEFAULT_RETENTION_POLICY,
  DEFAULT_REMOTE_PREFERENCES,
} from "./types.js";
export {
  REMOTE_WORKER_TOKEN_ENV,
  resolveAuthPlaceholder,
} from "./auth.js";
export {
  LocalFirstRemoteGpuWorkerClient,
  StubRemoteGpuWorkerClient,
  createRemoteGpuWorkerClient,
  createEmptyAuthPlaceholder,
  createConsent,
  type LocalFirstRemoteGpuWorkerClientOptions,
} from "./client.js";
export {
  buildProjectPayload,
  type ProjectPayloadInput,
  type BuiltRemotePayload,
} from "./payload.js";
export {
  encryptPayloadAesGcm,
  decryptPayloadAesGcm,
  sha256Hex,
  bytesToBase64,
  base64ToBytes,
  type AesGcmCipherBundle,
} from "./crypto.js";
export { deriveAesKeyFromToken } from "./key-derive.js";
export {
  FetchRemoteHttpTransport,
  createHttpTransport,
  REMOTE_WORKER_PATHS,
  type RemoteHttpTransport,
  type HttpTransportResult,
  type ArtifactDownloadResult,
} from "./http-transport.js";
