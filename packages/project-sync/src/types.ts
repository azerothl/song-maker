/**
 * Optional project sync — local-first, per-project opt-in.
 * First targets: filesystem (NAS/USB) and self-hosted HTTP.
 * @see docs/project-sync-contract.md
 */

export type ProjectSyncStatus =
  | "never_synced"
  | "pending"
  | "syncing"
  | "synced"
  | "error"
  | "not_implemented"
  | "conflict";

export type SyncConflictChoice = "keep-local" | "keep-remote" | "fork";

export type ProjectSyncPreferences = {
  /** Per-project opt-in. Default false. */
  syncEnabled: boolean;
  /** Opaque endpoint: http(s)://… or file:// / absolute sync root. */
  endpointBaseUrl: string;
  /** Absolute filesystem sync root when using FilesystemProjectSyncTransport. */
  syncRootPath: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  status: ProjectSyncStatus;
};

export const DEFAULT_PROJECT_SYNC_PREFERENCES: ProjectSyncPreferences = {
  syncEnabled: false,
  endpointBaseUrl: "",
  syncRootPath: "",
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
