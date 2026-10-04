import {
  createMixProductionToolkit,
  type MixProductionToolkit,
} from "@song-maker/mix-production";
import type { ProductionOverlay } from "./productionState";

/** Mirror de `UI_EFFECT_KINDS` (évite une dépendance runtime vers productionState). */
const SNAPSHOT_UI_EFFECT_KINDS = [
  "limiter",
  "compressor",
  "gate",
  "eq",
  "parametricEq",
  "filter",
  "delay",
  "reverb",
  "pitch_correct",
  "voice_cleanup",
  "voice_convert",
  "voice_denoise",
] as const;

function isUiEffectKind(kind: string): boolean {
  return (SNAPSHOT_UI_EFFECT_KINDS as readonly string[]).includes(kind);
}

/** Rebuild a fresh toolkit from a production overlay (worker-safe, no globals). */
export function createToolkitFromProductionOverlay(
  overlay: ProductionOverlay | null,
): MixProductionToolkit {
  const toolkit = createMixProductionToolkit();
  if (!overlay) return toolkit;
  const mixId = overlay.mixId;

  for (const [trackId, points] of Object.entries(overlay.volumePointsByTrack)) {
    if (points.length === 0) continue;
    toolkit.automation.setLane(mixId, {
      trackId,
      target: "volume",
      points,
    });
  }

  for (const [trackId, points] of Object.entries(overlay.panPointsByTrack)) {
    if (points.length === 0) continue;
    toolkit.automation.setLane(mixId, {
      trackId,
      target: "pan",
      points,
    });
  }

  for (const [key, points] of Object.entries(overlay.automationLanes)) {
    if (points.length === 0) continue;
    const sep = key.indexOf("|");
    if (sep <= 0) continue;
    const trackId = key.slice(0, sep);
    const target = key.slice(sep + 1);
    toolkit.automation.setLane(mixId, { trackId, target, points });
  }

  for (const [trackId, effects] of Object.entries(overlay.effectsByTrack)) {
    for (const slot of effects) {
      if (!isUiEffectKind(slot.kind)) continue;
      toolkit.effects.insert(trackId, slot);
    }
  }

  for (const route of overlay.sidechainRoutes) {
    if (route.sourceTrackId === route.destinationTrackId) continue;
    toolkit.sidechain.upsert(mixId, route);
  }

  return toolkit;
}
