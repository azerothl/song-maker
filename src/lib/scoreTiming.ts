import { INTERNAL_PPQ, type ScoreDocument } from "@song-maker/score-engine";

/**
 * Convert absolute score ticks to seconds using the document tempo map.
 * Absolute timing follows every tempo event, independently of ABC restrictions.
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
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  let seconds = 0;
  let previousTick = 0;
  let bpm = 120;
  for (const event of orderedTempos(document)) {
    if (event.tick > ticks) break;
    seconds += ticksToSeconds(event.tick - previousTick, bpm, document.ppq);
    previousTick = event.tick;
    bpm = event.quarterBpm;
  }
  return seconds + ticksToSeconds(ticks - previousTick, bpm, document.ppq);
}

export function scoreSecondsToTicks(
  document: ScoreDocument,
  seconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  let elapsed = 0;
  let previousTick = 0;
  let bpm = 120;
  for (const event of orderedTempos(document)) {
    const duration = ticksToSeconds(event.tick - previousTick, bpm, document.ppq);
    if (elapsed + duration > seconds) break;
    elapsed += duration;
    previousTick = event.tick;
    bpm = event.quarterBpm;
  }
  return previousTick + secondsToTicks(seconds - elapsed, bpm, document.ppq);
}

const tempoCache = new WeakMap<ScoreDocument["tempoMap"], ScoreDocument["tempoMap"]>();
function orderedTempos(document: ScoreDocument) {
  const cached = tempoCache.get(document.tempoMap);
  if (cached) return cached;
  const ordered = document.tempoMap.filter(event => Number.isFinite(event.tick) && event.tick >= 0
    && Number.isFinite(event.quarterBpm) && event.quarterBpm > 0).slice().sort((a, b) => a.tick - b.tick);
  tempoCache.set(document.tempoMap, ordered);
  return ordered;
}
