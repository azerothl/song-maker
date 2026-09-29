import type {
  ProjectSyncEnvelope,
  ProjectSyncPullRequest,
  ProjectSyncPushRequest,
  ProjectSyncResult,
  ProjectSyncTransport,
  SyncArtifactRef,
  SyncConflictChoice,
} from "./types.js";
import {
  base64ToBytes,
  bytesToBase64,
  decryptPayloadAesGcm,
  encryptPayloadAesGcm,
  sha256Hex,
} from "./crypto.js";

export type SyncFsBackend = {
  listLocal(projectId: string): Promise<
    Array<{ relativePath: string; contentSha256: string; byteLength: number }>
  >;
  readLocal(projectId: string, relativePath: string): Promise<Uint8Array>;
  writeLocal(
    projectId: string,
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<void>;
  listRemote(
    root: string,
    projectId: string,
  ): Promise<
    Array<{ relativePath: string; contentSha256: string; byteLength: number }>
  >;
  readRemote(
    root: string,
    projectId: string,
    relativePath: string,
  ): Promise<Uint8Array>;
  writeRemote(
    root: string,
    projectId: string,
    relativePath: string,
    bytes: Uint8Array,
  ): Promise<void>;
  deleteRemote(root: string, projectId: string): Promise<void>;
};

export type FilesystemTransportOptions = {
  /** Absolute path to sync root (NAS / USB / Documents/Song Maker/sync). */
  root: string;
  backend: SyncFsBackend;
  /** Persistent AES key for at-rest encryption (32 bytes). */
  keyBytes: Uint8Array;
  deviceId?: string;
  /** Max wav/audio bytes to include; larger files skipped with warning. */
  maxAudioBytes?: number;
  /** Conflict resolution when remote hash differs. */
  onConflict?: (
    path: string,
    localSha: string,
    remoteSha: string,
  ) => Promise<SyncConflictChoice>;
};

const DEFAULT_MAX_AUDIO = 80 * 1024 * 1024;

function isLargeAudio(path: string): boolean {
  return /\.(wav|flac|mp3|ogg)$/i.test(path);
}

/**
 * Self-hosted filesystem sync — first usable target (NAS / shared folder / USB).
 * Encrypts artifact bytes at rest with AES-256-GCM. Opt-out never calls backend.
 */
export class FilesystemProjectSyncTransport implements ProjectSyncTransport {
  constructor(private readonly options: FilesystemTransportOptions) {}

  async push(request: ProjectSyncPushRequest): Promise<ProjectSyncResult> {
    if (!request.syncEnabled) {
      return {
        status: "never_synced",
        error: "Synchro désactivée pour ce projet — aucun transfert.",
      };
    }
    if (!this.options.root.trim()) {
      return {
        status: "error",
        error: "Racine de synchro absente — choisissez un dossier local/NAS.",
      };
    }
    try {
      const local = await this.options.backend.listLocal(request.projectId);
      const remote = await this.options.backend.listRemote(
        this.options.root,
        request.projectId,
      );
      const remoteByPath = new Map(remote.map((a) => [a.relativePath, a]));
      const artifacts: SyncArtifactRef[] = [];
      const skipped: string[] = [];

      for (const item of local) {
        if (
          isLargeAudio(item.relativePath) &&
          item.byteLength > (this.options.maxAudioBytes ?? DEFAULT_MAX_AUDIO)
        ) {
          skipped.push(item.relativePath);
          continue;
        }
        const existing = remoteByPath.get(item.relativePath);
        if (existing && existing.contentSha256 !== item.contentSha256) {
          const choice = this.options.onConflict
            ? await this.options.onConflict(
                item.relativePath,
                item.contentSha256,
                existing.contentSha256,
              )
            : "keep-local";
          if (choice === "keep-remote") continue;
          if (choice === "fork") {
            // Fork: write under generations/fork-<ts>/… without overwrite.
            const forkPath = `forks/${Date.now()}/${item.relativePath}`;
            const plain = await this.options.backend.readLocal(
              request.projectId,
              item.relativePath,
            );
            await this.writeEncrypted(
              request.projectId,
              forkPath,
              plain,
            );
            artifacts.push({
              relativePath: forkPath,
              contentSha256: item.contentSha256,
              byteLength: item.byteLength,
              encryption: "aes-256-gcm",
            });
            continue;
          }
        }
        const plain = await this.options.backend.readLocal(
          request.projectId,
          item.relativePath,
        );
        await this.writeEncrypted(request.projectId, item.relativePath, plain);
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
      const envBytes = new TextEncoder().encode(JSON.stringify(envelope));
      await this.options.backend.writeRemote(
        this.options.root,
        request.projectId,
        "envelope.json",
        envBytes,
      );
      return {
        status: "synced",
        envelope,
        ...(skipped.length > 0
          ? {
              error: `Gros fichiers audio ignorés (${skipped.length}) — politique bande passante.`,
            }
          : {}),
      };
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
        error: "Synchro désactivée pour ce projet — aucun transfert.",
      };
    }
    try {
      const remote = await this.options.backend.listRemote(
        this.options.root,
        request.projectId,
      );
      const local = await this.options.backend.listLocal(request.projectId);
      const localByPath = new Map(local.map((a) => [a.relativePath, a]));
      const artifacts: SyncArtifactRef[] = [];

      for (const item of remote) {
        if (item.relativePath === "envelope.json" || item.relativePath.endsWith(".enc")) {
          // encrypted blobs stored as path.enc — skip listing noise
        }
        const encPath = `${item.relativePath}.enc`;
        let cipher: Uint8Array;
        try {
          cipher = await this.options.backend.readRemote(
            this.options.root,
            request.projectId,
            encPath,
          );
        } catch {
          // Plain fallback for envelope.json
          if (item.relativePath === "envelope.json") continue;
          cipher = await this.options.backend.readRemote(
            this.options.root,
            request.projectId,
            item.relativePath,
          );
        }
        const existing = localByPath.get(item.relativePath);
        if (existing && existing.contentSha256 !== item.contentSha256) {
          const choice = this.options.onConflict
            ? await this.options.onConflict(
                item.relativePath,
                existing.contentSha256,
                item.contentSha256,
              )
            : "keep-local";
          if (choice === "keep-local") continue;
          if (choice === "fork") {
            const forkPath = `forks/${Date.now()}/${item.relativePath}`;
            const plain = await this.decryptBlob(cipher);
            await this.options.backend.writeLocal(
              request.projectId,
              forkPath,
              plain,
            );
            continue;
          }
        }
        const plain = await this.decryptBlob(cipher);
        await this.options.backend.writeLocal(
          request.projectId,
          item.relativePath,
          plain,
        );
        artifacts.push({
          relativePath: item.relativePath,
          contentSha256: item.contentSha256,
          byteLength: item.byteLength,
          encryption: "aes-256-gcm",
        });
      }

      return {
        status: "synced",
        envelope: {
          schema: "song-maker.project-sync",
          schemaVersion: 1,
          projectId: request.projectId,
          deviceId: this.options.deviceId ?? "local-device",
          pushedAt: new Date().toISOString(),
          tombstone: false,
          artifacts,
        },
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
      await this.options.backend.deleteRemote(this.options.root, projectId);
      return { status: "synced" };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async writeEncrypted(
    projectId: string,
    relativePath: string,
    plain: Uint8Array,
  ): Promise<void> {
    const bundle = await encryptPayloadAesGcm(plain, this.options.keyBytes);
    const packed = new TextEncoder().encode(
      JSON.stringify({
        encryption: "aes-256-gcm",
        iv: bytesToBase64(bundle.iv),
        ciphertext: bytesToBase64(bundle.ciphertext),
        contentSha256: bundle.contentSha256,
      }),
    );
    await this.options.backend.writeRemote(
      this.options.root,
      projectId,
      `${relativePath}.enc`,
      packed,
    );
    // Also store plaintext meta hash file for listing
    await this.options.backend.writeRemote(
      this.options.root,
      projectId,
      relativePath,
      new TextEncoder().encode(
        JSON.stringify({
          contentSha256: await sha256Hex(plain),
          byteLength: plain.byteLength,
          encryption: "aes-256-gcm",
        }),
      ),
    );
  }

  private async decryptBlob(packed: Uint8Array): Promise<Uint8Array> {
    const text = new TextDecoder().decode(packed);
    try {
      const parsed = JSON.parse(text) as {
        iv?: string;
        ciphertext?: string;
      };
      if (parsed.iv && parsed.ciphertext) {
        return decryptPayloadAesGcm(
          base64ToBytes(parsed.ciphertext),
          this.options.keyBytes,
          base64ToBytes(parsed.iv),
        );
      }
    } catch {
      /* plain */
    }
    return packed;
  }
}
