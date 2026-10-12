/** audio.cpp >= v0.8.2 exposes the real ABC in base64 artifacts, not only score. */
export function extractRemoteScore(response: { score?: unknown; abc?: unknown; artifacts?: unknown }, fallback?: string): string | null {
  const valid = (value: unknown): value is string => typeof value === "string" && /^K\s*:/m.test(value);
  if (valid(response.score)) return response.score;
  if (valid(response.abc)) return response.abc;
  if (Array.isArray(response.artifacts)) {
    for (const artifact of response.artifacts) {
      const abc = [artifact?.meta?.format, artifact?.meta?.extension].some(value => typeof value === "string" && value.toLowerCase() === "abc")
        || (typeof artifact?.id === "string" && /score|abc/i.test(artifact.id));
      if (!abc || typeof artifact?.payload !== "string") continue;
      if (valid(artifact.payload)) return artifact.payload;
      const decoded = Buffer.from(artifact.payload, "base64").toString("utf8");
      if (valid(decoded)) return decoded;
    }
  }
  return valid(fallback) ? fallback : null;
}
