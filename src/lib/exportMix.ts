import {
  bakeMixPcm,
  decodeMixStems,
  float32ToLeBytes,
  shouldUseProductionExport,
} from "./mixBridge";
import { api } from "./api";
import type { MixDoc, PlaybackSources } from "./types";

/**
 * Export using the shared mix-production bake when a production overlay is
 * active (matches Web Audio bake). Otherwise falls back to the Rust §10.5 path.
 */
export async function exportProjectAudio(
  projectId: string,
  format: "wav" | "flac" | "mp3",
  mix: MixDoc | null,
  sources: PlaybackSources | null,
): Promise<string> {
  if (
    shouldUseProductionExport() &&
    mix &&
    sources &&
    sources.mode === "stems" &&
    sources.stems.length > 0
  ) {
    const { stems, sampleRate } = await decodeMixStems(sources, mix);
    const baked = bakeMixPcm(mix, stems);
    return api.exportPcmAudio(projectId, {
      format,
      pcmLe: float32ToLeBytes(baked.pcm),
      sampleRate: mix.sampleRate || sampleRate,
      channels: 2,
      peakTrimDb: baked.peakTrimDb,
      renderPath: `mix-production-ts/${baked.path}`,
      matchMode: "approximate",
    });
  }
  return api.exportAudio(projectId, format);
}
