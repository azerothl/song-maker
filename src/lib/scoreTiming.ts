import { INTERNAL_PPQ, type ScoreDocument } from "@song-maker/score-engine";

/**
 * Convert absolute score ticks to seconds using the document tempo map.
 * Only the first TempoEvent at tick 0 is used (YuE2 dialect: no mid-song stretch).
 */
export function ticksToSeconds(
  ticks: number,
  tempoBpm: number,
  ppq: number = INTERNAL_PPQ,
): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  const bpm = tempoBpm > 0 ? tempoBpm : 120;
  const quarters = ticks / ppq;
  return (quarters * 60) / bpm;
}

export function secondsToTicks(
  seconds: number,
  tempoBpm: number,
  ppq: number = INTERNAL_PPQ,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const bpm = tempoBpm > 0 ? tempoBpm : 120;
  return Math.round((seconds * bpm * ppq) / 60);
}

export function scoreTempoBpm(document: ScoreDocument): number {
  return document.tempoMap[0]?.quarterBpm ?? 120;
}

export function scoreTicksToSeconds(
  document: ScoreDocument,
  ticks: number,
): number {
  return ticksToSeconds(ticks, scoreTempoBpm(document), document.ppq);
}

export function scoreSecondsToTicks(
  document: ScoreDocument,
  seconds: number,
): number {
  return secondsToTicks(seconds, scoreTempoBpm(document), document.ppq);
}
