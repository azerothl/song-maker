import type { StemProviderId } from "./registry.js";

/** Track focus used to recommend a separator (#166). */
export type SeparationTrackFocus = "vocals" | "drums" | "mix";

export type TimeKind = "estimation" | "mesure";

export type SeparatorTimeStat = {
  /** Measured milliseconds of wall time per second of audio. */
  msPerAudioSec: number;
  samples: number;
};

/**
 * Baseline wall-time estimates (ms of work per second of audio) for a mid GPU.
 * Labeled « estimation » until the host records a measured sample.
 */
export const SEPARATOR_TIME_BASELINE_MS_PER_AUDIO_SEC: Record<
  StemProviderId,
  number
> = {
  htdemucs: 250,
  mel_band_roformer: 500,
  bs_roformer: 420,
  htdemucs_6s: 700,
};

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
  switch (focus) {
    case "vocals":
      return "Pour une piste voix / instrumental, Mel-Band RoFormer « Kim Vocal 2 » est recommandé.";
    case "drums":
      return "Pour isoler la batterie dans un mix, HTDemucs (4 stems) est recommandé.";
    case "mix":
      return "Pour un mix complet (voix, batterie, basse, accompagnement), HTDemucs est recommandé.";
    default: {
      const _exhaustive: never = focus;
      return _exhaustive;
    }
  }
}

export type QualityTimeOption = {
  id: StemProviderId;
  estimatedMs: number;
  kind: TimeKind;
  recommended: boolean;
};

export function formatDurationFr(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `~${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `~${m} min` : `~${m} min ${s} s`;
}

export function timeLabelFr(kind: TimeKind): string {
  return kind === "mesure" ? "mesuré" : "estimation";
}

/**
 * Builds the quality-option rows shown before separation.
 * Every option always carries a displayable time (#166 acceptance).
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
    const rate =
      measured && measured.samples > 0 && measured.msPerAudioSec > 0
        ? measured.msPerAudioSec
        : SEPARATOR_TIME_BASELINE_MS_PER_AUDIO_SEC[id];
    const kind: TimeKind =
      measured && measured.samples > 0 ? "mesure" : "estimation";
    return {
      id,
      estimatedMs: Math.round(rate * duration),
      kind,
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
