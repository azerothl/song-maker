import type { AuthPlaceholder } from "./types.js";

/** Env var name for the usable bearer token placeholder. */
export const REMOTE_WORKER_TOKEN_ENV = "SONG_MAKER_REMOTE_WORKER_TOKEN";

/**
 * Resolve auth from an explicit token, then env.
 * Never invents a token — null means unauthorized.
 */
function readProcessEnv(): Record<string, string | undefined> {
  try {
    // Node / Vitest; absent or non-enumerable in the Vite browser bundle.
    if (typeof process !== "undefined" && process.env) {
      return process.env as Record<string, string | undefined>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function resolveAuthPlaceholder(options?: {
  accessToken?: string | null;
  env?: Record<string, string | undefined>;
  expiresAt?: string | null;
}): AuthPlaceholder {
  const env = options?.env ?? readProcessEnv();
  const fromArg = options?.accessToken?.trim() || null;
  const fromEnv = env[REMOTE_WORKER_TOKEN_ENV]?.trim() || null;
  const accessToken = fromArg || fromEnv;
  return {
    scheme: "bearer_placeholder",
    accessToken,
    expiresAt: accessToken
      ? (options?.expiresAt ?? new Date(Date.now() + 3600_000).toISOString())
      : null,
  };
}
