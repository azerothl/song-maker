import type { TrackEffectSlot } from "./types.js";

/** Stem / mix roles presets understand. Missing roles are skipped. */
export type MixPresetRole =
  | "vocals"
  | "drums"
  | "bass"
  | "other"
  | "guitar"
  | "piano";

export type MixPresetTrackSettings = {
  /** Absolute track gain in dB (replaces current gain). */
  gainDb?: number;
  /** Absolute pan −1…1. */
  pan?: number;
  /**
   * Effects really supported by the production rack.
   * Shelf EQ (`eq`) stays distinct from parametric EQ.
   */
  effects?: TrackEffectSlot[];
};

export type MixPresetDefinition = {
  id: string;
  /** Stable i18n key suffix, e.g. `vocalsForward`. */
  labelKey: string;
  /** Roles → settings. Absent roles are ignored at apply time. */
  byRole: Partial<Record<MixPresetRole, MixPresetTrackSettings>>;
  /** Which parameters this preset may change (for UI honesty). */
  touches: ReadonlyArray<"gain" | "pan" | "effects">;
};

export type MixTrackForPreset = {
  id: string;
  role: string;
  gainDb: number;
  pan: number;
};

export type MixDocForPreset<TTrack extends MixTrackForPreset = MixTrackForPreset> =
  {
    tracks: TTrack[];
  };

export type AppliedMixPreset<TMix extends MixDocForPreset> = {
  mix: TMix;
  /** Effects keyed by track id — only tracks the preset touched. */
  effectsByTrack: Record<string, TrackEffectSlot[]>;
  appliedTrackIds: string[];
  skippedRoles: string[];
};

const PRESET_ROLES: readonly MixPresetRole[] = [
  "vocals",
  "drums",
  "bass",
  "other",
  "guitar",
  "piano",
] as const;

function isPresetRole(role: string): role is MixPresetRole {
  return (PRESET_ROLES as readonly string[]).includes(role);
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

/**
 * Built-in intent presets. Gains / pans / FX stay within what the engine
 * actually renders (shelf/parametric EQ, filter, compressor/gate, limiter,
 * stereo reverb, tempo-sync delay).
 */
export const MIX_PRESETS: readonly MixPresetDefinition[] = [
  {
    id: "vocals-forward",
    labelKey: "vocalsForward",
    touches: ["gain", "pan", "effects"],
    byRole: {
      vocals: {
        gainDb: 3,
        pan: 0,
        effects: [
          {
            id: "preset-vocals-forward-comp",
            kind: "compressor",
            enabled: true,
            params: { thresholdDb: -18, ratio: 2.5, makeupDb: 1 },
          },
          {
            id: "preset-vocals-forward-eq",
            kind: "eq",
            enabled: true,
            params: { gainDb: 1.5 },
          },
        ],
      },
      drums: { gainDb: -1, pan: 0 },
      bass: { gainDb: 0, pan: 0 },
      other: { gainDb: -2.5, pan: 0 },
      guitar: { gainDb: -2, pan: -0.2 },
      piano: { gainDb: -2, pan: 0.2 },
    },
  },
  {
    id: "energetic",
    labelKey: "energetic",
    touches: ["gain", "pan", "effects"],
    byRole: {
      vocals: {
        gainDb: 1.5,
        pan: 0,
        effects: [
          {
            id: "preset-energetic-vocals-comp",
            kind: "compressor",
            enabled: true,
            params: { thresholdDb: -16, ratio: 3, makeupDb: 0.5 },
          },
        ],
      },
      drums: {
        gainDb: 2.5,
        pan: 0,
        effects: [
          {
            id: "preset-energetic-drums-lim",
            kind: "limiter",
            enabled: true,
            params: { ceilingDb: -1 },
          },
        ],
      },
      bass: { gainDb: 1.5, pan: 0 },
      other: {
        gainDb: 0.5,
        pan: 0,
        effects: [
          {
            id: "preset-energetic-other-eq",
            kind: "eq",
            enabled: true,
            params: { gainDb: 1 },
          },
        ],
      },
      guitar: { gainDb: 1, pan: -0.15 },
      piano: { gainDb: 0.5, pan: 0.15 },
    },
  },
  {
    id: "soft-airy",
    labelKey: "softAiry",
    touches: ["gain", "pan", "effects"],
    byRole: {
      vocals: {
        gainDb: 0.5,
        pan: 0,
        effects: [
          {
            id: "preset-soft-vocals-reverb",
            kind: "reverb",
            enabled: true,
            params: { mix: 0.22, roomSize: 0.6, damping: 0.5, width: 1 },
          },
          {
            id: "preset-soft-vocals-eq",
            kind: "eq",
            enabled: true,
            params: { gainDb: -1 },
          },
        ],
      },
      drums: { gainDb: -2.5, pan: 0 },
      bass: { gainDb: -1.5, pan: 0 },
      other: {
        gainDb: -1,
        pan: 0.1,
        effects: [
          {
            id: "preset-soft-other-reverb",
            kind: "reverb",
            enabled: true,
            params: { mix: 0.18, roomSize: 0.7, damping: 0.4, width: 1 },
          },
        ],
      },
      guitar: { gainDb: -1.5, pan: -0.25 },
      piano: {
        gainDb: -1,
        pan: 0.25,
        effects: [
          {
            id: "preset-soft-piano-reverb",
            kind: "reverb",
            enabled: true,
            params: { mix: 0.2, roomSize: 0.65, damping: 0.45, width: 1 },
          },
        ],
      },
    },
  },
] as const;

export function getMixPreset(id: string): MixPresetDefinition | undefined {
  return MIX_PRESETS.find((p) => p.id === id);
}

export function listMixPresets(): readonly MixPresetDefinition[] {
  return MIX_PRESETS;
}

/**
 * Apply a preset to an existing mix without removing tracks or clips.
 * Roles with no matching track are listed in `skippedRoles`.
 * Custom / unknown roles are left untouched.
 */
export function applyMixPreset<TMix extends MixDocForPreset>(
  mix: TMix,
  presetId: string,
): AppliedMixPreset<TMix> {
  const preset = getMixPreset(presetId);
  if (!preset) {
    return {
      mix,
      effectsByTrack: {},
      appliedTrackIds: [],
      skippedRoles: [],
    };
  }

  const presentRoles = new Set(
    mix.tracks.map((tr) => normalizeRole(tr.role)).filter(isPresetRole),
  );
  const skippedRoles = Object.keys(preset.byRole).filter(
    (role) => !presentRoles.has(role as MixPresetRole),
  );

  const effectsByTrack: Record<string, TrackEffectSlot[]> = {};
  const appliedTrackIds: string[] = [];

  const tracks = mix.tracks.map((tr) => {
    const role = normalizeRole(tr.role);
    if (!isPresetRole(role)) return tr;
    const settings = preset.byRole[role];
    if (!settings) return tr;

    appliedTrackIds.push(tr.id);
    if (settings.effects && settings.effects.length > 0) {
      effectsByTrack[tr.id] = settings.effects.map((fx) => ({
        ...fx,
        params: { ...fx.params },
      }));
    }

    return {
      ...tr,
      gainDb:
        typeof settings.gainDb === "number" && Number.isFinite(settings.gainDb)
          ? settings.gainDb
          : tr.gainDb,
      pan:
        typeof settings.pan === "number" && Number.isFinite(settings.pan)
          ? Math.max(-1, Math.min(1, settings.pan))
          : tr.pan,
    };
  });

  return {
    mix: { ...mix, tracks },
    effectsByTrack,
    appliedTrackIds,
    skippedRoles,
  };
}
