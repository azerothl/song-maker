export type StoredEngineContract = {
  textFingerprint: string;
  acceptedAt: string;
  textVersion: string;
};

export function needsEngineContractAcceptance(
  stored: StoredEngineContract | undefined,
  currentFingerprint: string,
  currentVersion: string,
): boolean {
  if (!stored) return true;
  if (stored.textFingerprint !== currentFingerprint) return true;
  if (stored.textVersion !== currentVersion) return true;
  return false;
}
