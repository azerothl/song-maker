/**
 * AES-256-GCM helpers for project-sync envelopes (same class as remote-worker).
 */

export type AesGcmCipherBundle = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  contentSha256: string;
  encryption: "aes-256-gcm";
  keyBytes: Uint8Array;
};

function getSubtle(): SubtleCrypto | null {
  const c =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  return c?.subtle ?? null;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  if (!subtle) {
    let h = 0;
    for (let i = 0; i < data.length; i++) {
      h = (Math.imul(31, h) + (data[i] ?? 0)) | 0;
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    return hex.repeat(8).slice(0, 64);
  }
  const digest = await subtle.digest(
    "SHA-256",
    data.slice().buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encryptPayloadAesGcm(
  plaintext: Uint8Array,
  keyBytes?: Uint8Array,
): Promise<AesGcmCipherBundle> {
  const subtle = getSubtle();
  if (!subtle) {
    throw new Error(
      "Web Crypto SubtleCrypto indisponible — chiffrement AES-GCM impossible.",
    );
  }
  const key = keyBytes
    ? await subtle.importKey(
        "raw",
        keyBytes.slice().buffer as ArrayBuffer,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"],
      )
    : await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext.slice().buffer as ArrayBuffer,
  );
  const rawKey = new Uint8Array(await subtle.exportKey("raw", key));
  return {
    ciphertext: new Uint8Array(cipherBuf),
    iv,
    contentSha256: await sha256Hex(plaintext),
    encryption: "aes-256-gcm",
    keyBytes: rawKey,
  };
}

export async function decryptPayloadAesGcm(
  ciphertext: Uint8Array,
  keyBytes: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const subtle = getSubtle();
  if (!subtle) {
    throw new Error("Web Crypto SubtleCrypto indisponible — déchiffrement impossible.");
  }
  const key = await subtle.importKey(
    "raw",
    keyBytes.slice().buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: iv.slice().buffer as ArrayBuffer },
    key,
    ciphertext.slice().buffer as ArrayBuffer,
  );
  return new Uint8Array(plain);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
