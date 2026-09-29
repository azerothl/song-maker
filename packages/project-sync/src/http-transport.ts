import type {
  ProjectSyncEnvelope,
  ProjectSyncPullRequest,
  ProjectSyncPushRequest,
  ProjectSyncResult,
  ProjectSyncTransport,
  SyncArtifactRef,
} from "./types.js";
import {
  base64ToBytes,
  bytesToBase64,
  decryptPayloadAesGcm,
  encryptPayloadAesGcm,
} from "./crypto.js";

export const PROJECT_SYNC_PATHS = {
  put: (id: string) => `/v1/projects/${encodeURIComponent(id)}/sync`,
  get: (id: string) => `/v1/projects/${encodeURIComponent(id)}/sync`,
  del: (id: string) => `/v1/projects/${encodeURIComponent(id)}/sync`,
} as const;

export type HttpSyncArtifactSource = {
  list(projectId: string): Promise<
    Array<{ relativePath: string; contentSha256: string; byteLength: number }>
  >;
  read(projectId: string, relativePath: string): Promise<Uint8Array>;
  write(
    projectId: string,
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<void>;
};

export type HttpProjectSyncTransportOptions = {
  baseUrl: string;
  requireTls?: boolean;
  keyBytes: Uint8Array;
  artifactSource: HttpSyncArtifactSource;
  deviceId?: string;
  accessToken?: string | null;
};

/**
 * HTTP sync against a self-hosted server implementing docs/project-sync-contract.md.
 */
export class HttpProjectSyncTransport implements ProjectSyncTransport {
  constructor(private readonly options: HttpProjectSyncTransportOptions) {}

  private headers(): HeadersInit {
    const h: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.options.accessToken) {
      h.Authorization = `Bearer ${this.options.accessToken}`;
    }
    return h;
  }

  private base(): string {
    return this.options.baseUrl.replace(/\/?$/, "/");
  }

  async push(request: ProjectSyncPushRequest): Promise<ProjectSyncResult> {
    if (!request.syncEnabled) {
      return {
        status: "never_synced",
        error: "Synchro désactivée pour ce projet — aucun appel réseau.",
      };
    }
    if (!this.options.baseUrl.trim()) {
      return {
        status: "error",
        error: "Endpoint sync absent. Voir docs/project-sync-contract.md.",
      };
    }
    if (
      this.options.requireTls !== false &&
      !this.options.baseUrl.startsWith("https://") &&
      !this.options.baseUrl.includes("127.0.0.1") &&
      !this.options.baseUrl.includes("localhost")
    ) {
      return {
        status: "error",
        error: "TLS (https://) requis hors localhost pour la synchro.",
      };
    }
    try {
      const local = await this.options.artifactSource.list(request.projectId);
      const packed: Array<{
        relativePath: string;
        contentSha256: string;
        byteLength: number;
        encryption: "aes-256-gcm";
        iv: string;
        ciphertextBase64: string;
      }> = [];
      const artifacts: SyncArtifactRef[] = [];
      for (const item of local) {
        const plain = await this.options.artifactSource.read(
          request.projectId,
          item.relativePath,
        );
        const bundle = await encryptPayloadAesGcm(plain, this.options.keyBytes);
        packed.push({
          relativePath: item.relativePath,
          contentSha256: item.contentSha256,
          byteLength: item.byteLength,
          encryption: "aes-256-gcm",
          iv: bytesToBase64(bundle.iv),
          ciphertextBase64: bytesToBase64(bundle.ciphertext),
        });
        artifacts.push({
          relativePath: item.relativePath,
          contentSha256: item.contentSha256,
          byteLength: item.byteLength,
          encryption: "aes-256-gcm",
        });
      }
      const envelope: ProjectSyncEnvelope = {
        schema: "song-maker.project-sync",
        schemaVersion: 1,
        projectId: request.projectId,
        deviceId: this.options.deviceId ?? "local-device",
        pushedAt: new Date().toISOString(),
        tombstone: false,
        artifacts,
      };
      const url = new URL(
        PROJECT_SYNC_PATHS.put(request.projectId),
        this.base(),
      );
      const res = await fetch(url, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ envelope, artifacts: packed }),
      });
      if (!res.ok) {
        return {
          status: "error",
          error: `Push HTTP ${res.status} — PUT ${PROJECT_SYNC_PATHS.put(":id")} requis.`,
        };
      }
      return { status: "synced", envelope };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async pull(request: ProjectSyncPullRequest): Promise<ProjectSyncResult> {
    if (!request.syncEnabled) {
      return {
        status: "never_synced",
        error: "Synchro désactivée pour ce projet — aucun appel réseau.",
      };
    }
    try {
      const url = new URL(
        PROJECT_SYNC_PATHS.get(request.projectId),
        this.base(),
      );
      const res = await fetch(url, { method: "GET", headers: this.headers() });
      if (!res.ok) {
        return {
          status: "error",
          error: `Pull HTTP ${res.status} — GET ${PROJECT_SYNC_PATHS.get(":id")} requis.`,
        };
      }
      const json = (await res.json()) as {
        envelope?: ProjectSyncEnvelope;
        artifacts?: Array<{
          relativePath: string;
          ciphertextBase64: string;
          iv: string;
          contentSha256: string;
          byteLength: number;
        }>;
      };
      for (const item of json.artifacts ?? []) {
        const cipher = base64ToBytes(item.ciphertextBase64);
        // Store encrypted blob as-is for host to decrypt with shared key via app layer.
        // For simplicity, write ciphertext JSON sidecar the host decrypts on writeLocal.
        const plain = await decryptPayloadAesGcm(
          cipher,
          this.options.keyBytes,
          base64ToBytes(item.iv),
        );
        await this.options.artifactSource.write(
          request.projectId,
          item.relativePath,
          plain,
        );
      }
      return {
        status: "synced",
        ...(json.envelope ? { envelope: json.envelope } : {}),
      };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async deleteRemote(projectId: string): Promise<ProjectSyncResult> {
    try {
      const url = new URL(PROJECT_SYNC_PATHS.del(projectId), this.base());
      const res = await fetch(url, {
        method: "DELETE",
        headers: this.headers(),
      });
      if (!res.ok) {
        return { status: "error", error: `Delete HTTP ${res.status}` };
      }
      return { status: "synced" };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
