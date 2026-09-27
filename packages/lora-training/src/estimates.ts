import type { CorpusSong, ResourceEstimate } from "./types.js";

/**
 * Estimated VRAM / disk / duration — marked measured:false until
 * values are taken on the target machine (issue #43).
 */
export function estimateTrainingResources(
  songs: CorpusSong[],
): ResourceEstimate {
  const totalMs = songs.reduce((acc, s) => acc + s.durationMs, 0);
  const hoursAudio = totalMs / 3_600_000;
  // Placeholders derived from community NAR recipes — not guarantees.
  const vramMib = 20_480; // ~20 GiB class placeholder
  const diskMib = Math.ceil(8_192 + hoursAudio * 2_048 + songs.length * 128);
  const durationMinutes = Math.max(
    30,
    Math.ceil(60 + hoursAudio * 90 + songs.length * 5),
  );
  return {
    measured: false,
    vramMib,
    diskMib,
    durationMinutes,
    noteFr:
      "Estimations indicatives (non mesurées sur cette machine). " +
      "Mesurez VRAM/disque/durée sur votre GPU avant de compter dessus. " +
      "Les recettes communautaires varient fortement.",
  };
}
