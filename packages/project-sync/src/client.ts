import type {
  ProjectSyncPreferences,
  ProjectSyncPullRequest,
  ProjectSyncPushRequest,
  ProjectSyncResult,
  ProjectSyncTransport,
} from "./types.js";
import { DEFAULT_PROJECT_SYNC_PREFERENCES } from "./types.js";

const NOT_IMPLEMENTED_FR =
  "Synchronisation cloud : non implémentée — aucun backend livré. " +
  "Le mode local reste complet. Voir docs/project-sync-contract.md.";

/**
 * Honest stub transport — always not_implemented.
 * Replace later without changing ProjectSyncTransport.
 */
export class NotImplementedProjectSyncTransport implements ProjectSyncTransport {
  async push(request: ProjectSyncPushRequest): Promise<ProjectSyncResult> {
    if (!request.syncEnabled) {
      return {
        status: "never_synced",
        error: "Synchro désactivée pour ce projet — aucun appel réseau.",
      };
    }
    return { status: "not_implemented", error: NOT_IMPLEMENTED_FR };
  }

  async pull(request: ProjectSyncPullRequest): Promise<ProjectSyncResult> {
    if (!request.syncEnabled) {
      return {
        status: "never_synced",
        error: "Synchro désactivée pour ce projet — aucun appel réseau.",
      };
    }
    return { status: "not_implemented", error: NOT_IMPLEMENTED_FR };
  }

  async deleteRemote(_projectId: string): Promise<ProjectSyncResult> {
    return { status: "not_implemented", error: NOT_IMPLEMENTED_FR };
  }
}

export class LocalFirstProjectSyncClient {
  private readonly prefsByProject = new Map<string, ProjectSyncPreferences>();
  private readonly transport: ProjectSyncTransport;

  constructor(transport: ProjectSyncTransport = new NotImplementedProjectSyncTransport()) {
    this.transport = transport;
  }

  getPreferences(projectId: string): ProjectSyncPreferences {
    return {
      ...DEFAULT_PROJECT_SYNC_PREFERENCES,
      ...this.prefsByProject.get(projectId),
    };
  }

  setPreferences(
    projectId: string,
    patch: Partial<ProjectSyncPreferences>,
  ): ProjectSyncPreferences {
    const next = {
      ...this.getPreferences(projectId),
      ...patch,
    };
    // Opt-out clears error noise but keeps never_synced honesty.
    if (!next.syncEnabled) {
      next.status = "never_synced";
      next.lastError = null;
    }
    this.prefsByProject.set(projectId, next);
    return next;
  }

  async push(projectId: string, envelope: ProjectSyncPushRequest["envelope"]): Promise<ProjectSyncResult> {
    const prefs = this.getPreferences(projectId);
    const result = await this.transport.push({
      projectId,
      envelope,
      syncEnabled: prefs.syncEnabled,
    });
    this.setPreferences(projectId, {
      status: result.status,
      lastError: result.error ?? null,
      lastSyncedAt:
        result.status === "synced" ? new Date().toISOString() : prefs.lastSyncedAt,
    });
    return result;
  }

  async pull(projectId: string): Promise<ProjectSyncResult> {
    const prefs = this.getPreferences(projectId);
    const result = await this.transport.pull({
      projectId,
      syncEnabled: prefs.syncEnabled,
    });
    this.setPreferences(projectId, {
      status: result.status,
      lastError: result.error ?? null,
    });
    return result;
  }
}

export function createProjectSyncClient(
  transport?: ProjectSyncTransport,
): LocalFirstProjectSyncClient {
  return new LocalFirstProjectSyncClient(transport);
}

export function createEmptyEnvelope(
  projectId: string,
  deviceId = "local-device",
): ProjectSyncPushRequest["envelope"] {
  return {
    schema: "song-maker.project-sync",
    schemaVersion: 1,
    projectId,
    deviceId,
    pushedAt: new Date().toISOString(),
    tombstone: false,
    artifacts: [],
  };
}
