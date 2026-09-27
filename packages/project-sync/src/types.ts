/**
 * Optional project sync — local-first, per-project opt-in.
 * Cloud backend is not shipped; transport stays not_implemented.
 * @see docs/project-sync-contract.md
 */

export type ProjectSyncStatus =
  | "never_synced"
  | "pending"
  | "syncing"
  | "synced"
  | "error"
  | "not_implemented";

export type ProjectSyncPreferences = {
  /** Per-project opt-in. Default false. */
  syncEnabled: boolean;
  /** Opaque endpoint if/when a backend exists. */
  endpointBaseUrl: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  status: ProjectSyncStatus;
};

export const DEFAULT_PROJECT_SYNC_PREFERENCES: ProjectSyncPreferences = {
  syncEnabled: false,
  endpointBaseUrl: "",
  lastSyncedAt: null,
  lastError: null,
  status: "never_synced",
};

export type SyncArtifactRef = {
  relativePath: string;
  contentSha256: string;
  byteLength: number;
  encryption: "aes-256-gcm" | "none";
};

export type ProjectSyncEnvelope = {
  schema: "song-maker.project-sync";
  schemaVersion: 1;
  projectId: string;
  deviceId: string;
  pushedAt: string;
  tombstone: boolean;
  artifacts: SyncArtifactRef[];
};

export type ProjectSyncPushRequest = {
  projectId: string;
  envelope: ProjectSyncEnvelope;
  /** User opted in for this project. */
  syncEnabled: boolean;
};

export type ProjectSyncPullRequest = {
  projectId: string;
  syncEnabled: boolean;
};

export type ProjectSyncResult = {
  status: ProjectSyncStatus;
  error?: string;
  envelope?: ProjectSyncEnvelope;
};

/**
 * Transport surface — mirror remote-worker honesty.
 * Implementations must not invent a cloud backend.
 */
export interface ProjectSyncTransport {
  push(request: ProjectSyncPushRequest): Promise<ProjectSyncResult>;
  pull(request: ProjectSyncPullRequest): Promise<ProjectSyncResult>;
  deleteRemote(projectId: string): Promise<ProjectSyncResult>;
}
