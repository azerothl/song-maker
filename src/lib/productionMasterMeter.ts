/** Peak 0–1 at the playhead from mix waveform buckets. */
export function mixPeakAtPlayhead(
  peaks: Float32Array | null | undefined,
  currentSec: number,
  durationSec: number,
): number {
  if (!peaks || peaks.length === 0 || durationSec <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, currentSec / durationSec));
  const i = Math.min(peaks.length - 1, Math.floor(ratio * peaks.length));
  const v = peaks[i] ?? 0;
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(1, v);
}

export function mixPeakPercent(peak: number): number {
  return Math.round(Math.min(1, Math.max(0, peak)) * 100);
}
