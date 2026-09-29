import type { StemProviderId } from "./registry.js";

/** Track focus used to recommend a separator (#166). */
export type SeparationTrackFocus = "vocals" | "drums" | "mix";

export type TimeKind = "mesure" | "exemple_non_mesure";

export type SeparatorTimeStat = {
  /** Measured milliseconds of wall time per second of audio (includes model load). */
  msPerAudioSec: number;
  samples: number;
};

const UNMEASURED_RECOMMENDATION_FR =
  "Recommandation non mesurée — deviendra un conseil après tests sur nos propres pistes.";

export function recommendSeparator(
  focus: SeparationTrackFocus,
): StemProviderId {
  switch (focus) {
    case "vocals":
      return "mel_band_roformer";
    case "drums":
      return "htdemucs";
    case "mix":
      return "htdemucs";
    default: {
      const _exhaustive: never = focus;
      return _exhaustive;
    }
  }
}

export function recommendReasonFr(focus: SeparationTrackFocus): string {
  const base = (() => {
    switch (focus) {
      case "vocals":
        return "Pour une piste voix / instrumental, Mel-Band RoFormer « Kim Vocal 2 » est proposé.";
      case "drums":
        return "Pour isoler la batterie dans un mix, HTDemucs (4 stems) est proposé.";
      case "mix":
        return "Pour un mix complet (voix, batterie, basse, accompagnement), HTDemucs est proposé.";
      default: {
        const _exhaustive: never = focus;
        return _exhaustive;
      }
    }
  })();
  return `${UNMEASURED_RECOMMENDATION_FR} ${base}`;
}

export function unmeasuredRecommendationNoticeFr(): string {
  return UNMEASURED_RECOMMENDATION_FR;
}

export type QualityTimeOption = {
  id: StemProviderId;
  estimatedMs: number | null;
  kind: TimeKind;
  recommended: boolean;
};

export function formatDurationFr(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `~${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `~${m} min` : `~${m} min ${s} s`;
}

export function timeLabelFr(kind: TimeKind): string {
  switch (kind) {
    case "mesure":
      return "mesuré (chargement du modèle inclus)";
    case "exemple_non_mesure":
      return "exemple, non mesuré";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Builds the quality-option rows shown before separation (#166).
 * No invented wall-time: only measured stats produce a duration estimate.
 */
export function buildQualityTimeOptions(args: {
  focus: SeparationTrackFocus;
  audioDurationSec: number;
  measured?: Partial<Record<StemProviderId, SeparatorTimeStat>>;
  ids?: StemProviderId[];
}): QualityTimeOption[] {
  const ids = args.ids ?? [
    "htdemucs",
    "mel_band_roformer",
    "bs_roformer",
    "htdemucs_6s",
  ];
  const recommended = recommendSeparator(args.focus);
  const duration = Math.max(1, args.audioDurationSec);
  return ids.map((id) => {
    const measured = args.measured?.[id];
    const hasMeasure =
      measured != null && measured.samples > 0 && measured.msPerAudioSec > 0;
    return {
      id,
      estimatedMs: hasMeasure
        ? Math.round(measured.msPerAudioSec * duration)
        : null,
      kind: hasMeasure ? "mesure" : "exemple_non_mesure",
      recommended: id === recommended,
    };
  });
}

/** Merge a new measurement into stored stats (running average). */
export function mergeTimeStat(
  prev: SeparatorTimeStat | undefined,
  wallMs: number,
  audioDurationSec: number,
): SeparatorTimeStat {
  const duration = Math.max(0.5, audioDurationSec);
  const sample = wallMs / duration;
  if (!prev || prev.samples <= 0) {
    return { msPerAudioSec: sample, samples: 1 };
  }
  const nextSamples = prev.samples + 1;
  const msPerAudioSec =
    (prev.msPerAudioSec * prev.samples + sample) / nextSamples;
  return { msPerAudioSec, samples: nextSamples };
}
