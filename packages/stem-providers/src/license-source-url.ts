/** First HTTPS URL in a licence row `source_url` (may list several sources). */
export function extractPrimaryLicenseSourceUrl(sourceUrl: string): string | null {
  const match = sourceUrl.match(/https?:\/\/[^\s);,]+/);
  if (!match) return null;
  let url = match[0];
  while (url.endsWith(")") || url.endsWith(".") || url.endsWith(",")) {
    url = url.slice(0, -1);
  }
  return url;
}

export function isValidLicenseHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
