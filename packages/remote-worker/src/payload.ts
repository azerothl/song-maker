import {
  bytesToBase64,
  encryptPayloadAesGcm,
  sha256Hex,
} from "./crypto.js";
import { deriveAesKeyFromToken } from "./key-derive.js";
import type { EncryptedBlobRef, RemoteJobKind } from "./types.js";

export type ProjectPayloadInput = {
  projectId: string;
  kind: RemoteJobKind;
  /** JSON-serializable generation / separation request body. */
  request: unknown;
  /** Optional ABC or lyrics bytes included in the hashed envelope. */
  artifacts?: Record<string, string>;
  /**
   * Shared bearer token — when set, AES key is derived so the reference
   * worker can decrypt. Without it, encryption uses an ephemeral key and
   * ciphertext is not attached (probe / offline hash only).
   */
  accessToken?: string | null;
};

export type BuiltRemotePayload = {
  /** Canonical JSON bytes that were hashed / encrypted. */
  plaintext: Uint8Array;
  plaintextSha256: string;
  blob: EncryptedBlobRef;
  /** Present when AES-GCM succeeded; keep offline for decrypt. */
  aesKeyBytes?: Uint8Array;
  iv?: Uint8Array;
};

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Build a real project payload envelope (not blob://probe).
 * Hashes the plaintext; encrypts with AES-GCM when Web Crypto is available.
 * With accessToken, attaches ciphertextBase64 + ivBase64 for the worker.
 */
export async function buildProjectPayload(
  input: ProjectPayloadInput,
): Promise<BuiltRemotePayload> {
  const envelope = {
    schema: "song-maker.remote-payload",
    schemaVersion: 1,
    projectId: input.projectId,
    kind: input.kind,
    request: input.request,
    artifacts: input.artifacts ?? {},
    builtAt: new Date().toISOString(),
  };
  const plaintext = encodeUtf8(JSON.stringify(envelope));
  const plaintextSha256 = await sha256Hex(plaintext);

  try {
    const token = input.accessToken?.trim() || null;
    const keyBytes = token ? await deriveAesKeyFromToken(token) : undefined;
    const cipher = await encryptPayloadAesGcm(plaintext, keyBytes);
    const blob: EncryptedBlobRef = {
      cipherPath: `memory://aes-gcm/${input.projectId}/${plaintextSha256.slice(0, 12)}`,
      contentSha256: cipher.contentSha256,
      encryption: "aes-256-gcm",
      byteLength: plaintext.byteLength,
    };
    if (token) {
      blob.ciphertextBase64 = bytesToBase64(cipher.ciphertext);
      blob.ivBase64 = bytesToBase64(cipher.iv);
    }
    return {
      plaintext,
      plaintextSha256,
      blob,
      aesKeyBytes: cipher.keyBytes,
      iv: cipher.iv,
    };
  } catch {
    // Honest: no silent fake success — mark placeholder when crypto missing.
    const blob: EncryptedBlobRef = {
      cipherPath: `memory://plaintext-hash/${input.projectId}/${plaintextSha256.slice(0, 12)}`,
      contentSha256: plaintextSha256,
      encryption: "aes-256-gcm-placeholder",
      byteLength: plaintext.byteLength,
    };
    return { plaintext, plaintextSha256, blob };
  }
}
