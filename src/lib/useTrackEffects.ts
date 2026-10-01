import { useCallback, useEffect, useState } from "react";
import type { TrackEffectSlot } from "@song-maker/mix-production";
import {
  defaultEffectParams,
  ensureProductionOverlay,
  getProductionOverlay,
  newEffectId,
  setTrackEffects,
  subscribeProduction,
  type UiEffectKind,
} from "./productionState";

export type UseTrackEffectsOptions = {
  tempoBpm?: number | null;
  canAddPitchCorrect?: boolean;
};

export function useTrackEffects(
  mixId: string | null | undefined,
  trackId: string,
  options: UseTrackEffectsOptions = {},
) {
  const { tempoBpm = null, canAddPitchCorrect = true } = options;
  const [effects, setEffects] = useState<TrackEffectSlot[]>([]);

  const syncFromOverlay = useCallback(() => {
    const o = getProductionOverlay();
    if (!mixId || !o || o.mixId !== mixId || !trackId) {
      setEffects([]);
      return;
    }
    setEffects(o.effectsByTrack[trackId] ?? []);
  }, [mixId, trackId]);

  useEffect(() => subscribeProduction(syncFromOverlay), [syncFromOverlay]);

  useEffect(() => {
    if (!mixId || !trackId) {
      setEffects([]);
      return;
    }
    ensureProductionOverlay(mixId);
    syncFromOverlay();
  }, [mixId, trackId, syncFromOverlay]);

  const persist = useCallback(
    (next: TrackEffectSlot[]) => {
      if (!mixId || !trackId) return;
      setEffects(next);
      setTrackEffects(mixId, trackId, next);
    },
    [mixId, trackId],
  );

  const addEffect = useCallback(
    (kind: UiEffectKind) => {
      if (!mixId || !trackId) return;
      if (kind === "pitch_correct" && !canAddPitchCorrect) return;
      const params = defaultEffectParams(kind);
      if (
        kind === "delay" &&
        typeof tempoBpm === "number" &&
        tempoBpm > 0 &&
        (params.tempoBpm === 0 || params.tempoBpm == null)
      ) {
        params.tempoBpm = tempoBpm;
      }
      const slot: TrackEffectSlot = {
        id: newEffectId(kind),
        kind,
        enabled: true,
        params,
      };
      persist([...effects, slot]);
    },
    [mixId, trackId, canAddPitchCorrect, tempoBpm, effects, persist],
  );

  const updateEffect = useCallback(
    (id: string, patch: Partial<TrackEffectSlot>) => {
      persist(effects.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [effects, persist],
  );

  const updateEffectParam = useCallback(
    (id: string, key: string, value: number | string | boolean) => {
      persist(
        effects.map((e) =>
          e.id === id ? { ...e, params: { ...e.params, [key]: value } } : e,
        ),
      );
    },
    [effects, persist],
  );

  const removeEffect = useCallback(
    (id: string) => {
      persist(effects.filter((e) => e.id !== id));
    },
    [effects, persist],
  );

  const moveEffect = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = effects.findIndex((e) => e.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= effects.length) return;
      const next = [...effects];
      const tmp = next[idx]!;
      next[idx] = next[j]!;
      next[j] = tmp;
      persist(next);
    },
    [effects, persist],
  );

  return {
    effects,
    addEffect,
    updateEffect,
    updateEffectParam,
    removeEffect,
    moveEffect,
  };
}
