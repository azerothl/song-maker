import { invoke } from "@tauri-apps/api/core";
import type { MixDoc } from "./types";

export type QwenAdjustment = { trackId: string; gainDb: number; pan: number };
export type QwenMixResponse = { model: string; adjustments: QwenAdjustment[]; explanation: string; elapsedMs: number };
export type QwenTrackSummary = { id: string; name: string; role: string; gainDb: number; pan: number; rmsDb: number; peakDb: number };

export function filterApplicableQwenAdjustments(
  mix: MixDoc,
  adjustments: QwenAdjustment[],
): { adjustments: QwenAdjustment[]; rejectedCount: number } {
  const accepted: QwenAdjustment[] = [];
  const seen = new Set<string>();
  let rejectedCount = 0;
  for (const adjustment of adjustments) {
    const track = mix.tracks.find((candidate) => candidate.id === adjustment.trackId);
    if (
      !track ||
      seen.has(adjustment.trackId) ||
      !Number.isFinite(adjustment.gainDb) ||
      !Number.isFinite(adjustment.pan) ||
      adjustment.gainDb < -60 ||
      adjustment.gainDb > 12 ||
      Math.abs(adjustment.gainDb - track.gainDb) > 6 ||
      Math.abs(adjustment.pan) > 1
    ) {
      rejectedCount += 1;
      continue;
    }
    seen.add(adjustment.trackId);
    if (
      Math.abs(adjustment.gainDb - track.gainDb) <= 0.01 &&
      Math.abs(adjustment.pan - track.pan) <= 0.01
    ) {
      continue;
    }
    accepted.push(adjustment);
  }
  return { adjustments: accepted, rejectedCount };
}

export const proposeQwenMix = (tracks: QwenTrackSummary[], objective: string, locale: string) =>
  invoke<QwenMixResponse>("propose_qwen_mix", { req: { tracks, objective, locale } });

export function applyQwenAdjustments(mix: MixDoc, adjustments: QwenAdjustment[]): MixDoc {
  const filtered = filterApplicableQwenAdjustments(mix, adjustments);
  if (filtered.rejectedCount > 0) throw new Error("INVALID_RESPONSE");
  const byId = new Map(filtered.adjustments.map((adjustment) => [adjustment.trackId, adjustment]));
  return { ...mix, tracks: mix.tracks.map(track => {
    const adjustment=byId.get(track.id);
    return adjustment ? { ...track, gainDb:adjustment.gainDb,pan:adjustment.pan } : track;
  }) };
}
