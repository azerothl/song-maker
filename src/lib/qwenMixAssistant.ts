import { invoke } from "@tauri-apps/api/core";
import type { MixDoc } from "./types";

export type QwenAdjustment = { trackId: string; gainDb: number; pan: number };
export type QwenMixResponse = { model: string; adjustments: QwenAdjustment[]; explanation: string; elapsedMs: number };
export type QwenTrackSummary = { id: string; name: string; role: string; gainDb: number; pan: number; rmsDb: number; peakDb: number };

export const proposeQwenMix = (tracks: QwenTrackSummary[], objective: string, locale: string) =>
  invoke<QwenMixResponse>("propose_qwen_mix", { req: { tracks, objective, locale } });

export function applyQwenAdjustments(mix: MixDoc, adjustments: QwenAdjustment[]): MixDoc {
  const byId = new Map<string, QwenAdjustment>();
  for (const adjustment of adjustments) {
    const track = mix.tracks.find(track => track.id === adjustment.trackId);
    if (!track || byId.has(adjustment.trackId) || !Number.isFinite(adjustment.gainDb)
      || !Number.isFinite(adjustment.pan) || adjustment.gainDb < -60 || adjustment.gainDb > 12
      || Math.abs(adjustment.gainDb-track.gainDb) > 6 || Math.abs(adjustment.pan) > 1) {
      throw new Error("INVALID_RESPONSE");
    }
    byId.set(adjustment.trackId,adjustment);
  }
  return { ...mix, tracks: mix.tracks.map(track => {
    const adjustment=byId.get(track.id);
    return adjustment ? { ...track, gainDb:adjustment.gainDb,pan:adjustment.pan } : track;
  }) };
}
