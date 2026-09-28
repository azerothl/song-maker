/**
 * Shared AES-256 key derivation for remote payload envelope.
 * Client and reference worker must agree: HKDF-SHA-256 over the bearer token.
 */

const SALT = new TextEncoder().encode("song-maker-remote-v1");
const INFO = new TextEncoder().encode("payload-aes-256-gcm");

function getSubtle(): SubtleCrypto | null {
  const c =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  return c?.subtle ?? null;
}

/** Derive 32 raw AES key bytes from the shared bearer token. */
export async function deriveAesKeyFromToken(
  token: string,
): Promise<Uint8Array> {
  const subtle = getSubtle();
  if (!subtle) {
    throw new Error(
      "Web Crypto SubtleCrypto indisponible — dérivation de clé impossible.",
    );
  }
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Jeton vide — dérivation de clé refusée.");
  }
  const ikm = await subtle.importKey(
    "raw",
    new TextEncoder().encode(trimmed),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}
