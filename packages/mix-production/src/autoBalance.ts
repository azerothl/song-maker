import { dbToLinear, linearToDb } from "./dsp.js";

/** Roles that receive an automatic starting balance. */
export type BalanceRole =
  | "vocals"
  | "drums"
  | "bass"
  | "other"
  | "guitar"
  | "piano";

export type StemLevelMeasurement = {
  trackId: string;
  role: string;
  /** Broadband RMS across L/R, dBFS. */
  rmsDb: number;
  /** True peak across L/R, dBFS. */
  peakDb: number;
  /** True when peak is below the silence floor. */
  silent: boolean;
  frameCount: number;
};

export type StemBalanceProposal = {
  trackId: string;
  role: string;
  currentGainDb: number;
  proposedGainDb: number;
  deltaDb: number;
  measured: StemLevelMeasurement;
  /** Why this track was left alone or adjusted. */
  note: "balanced" | "silent" | "custom" | "unknown_role" | "clamped";
};

export type AutoBalanceResult = {
  proposals: StemBalanceProposal[];
  /** Estimated bus true-peak after proposed gains (before peakCeiling trim). */
  estimatedBusPeakDb: number;
  /** Extra master trim applied so the bus stays under the ceiling. */
  masterTrimDb: number;
  /** Honesty: starting point only — not a pro mix / master. */
  limitedBoost: boolean;
};

export type PlanarStemInput = {
  trackId: string;
  left: Float32Array;
  right: Float32Array;
};

export type MixTrackForBalance = {
  id: string;
  role: string;
  gainDb: number;
};

/** Target RMS (dBFS) for a balanced starting mix by role. */
export const ROLE_TARGET_RMS_DB: Readonly<Record<BalanceRole, number>> = {
  vocals: -18,
  drums: -16,
  bass: -20,
  other: -22,
  guitar: -21,
  piano: -21,
};

export const AUTO_BALANCE_GAIN_MIN_DB = -12;
export const AUTO_BALANCE_GAIN_MAX_DB = 6;
/** Do not raise a track by more than this in one pass. */
export const AUTO_BALANCE_MAX_BOOST_DB = 6;
export const AUTO_BALANCE_SILENCE_PEAK_DB = -60;
export const AUTO_BALANCE_BUS_CEILING_DB = -1;

const BALANCE_ROLES: readonly BalanceRole[] = [
  "vocals",
  "drums",
  "bass",
  "other",
  "guitar",
  "piano",
] as const;

function isBalanceRole(role: string): role is BalanceRole {
  return (BALANCE_ROLES as readonly string[]).includes(role);
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundDb(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Measure useful level (RMS + peak) for one planar stereo stem.
 * Unequal channel lengths use the shorter length.
 */
export function measurePlanarStemLevel(
  trackId: string,
  role: string,
  left: Float32Array,
  right: Float32Array,
): StemLevelMeasurement {
  const n = Math.min(left.length, right.length);
  if (n <= 0) {
    return {
      trackId,
      role,
      rmsDb: -120,
      peakDb: -120,
      silent: true,
      frameCount: 0,
    };
  }

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    const aL = Math.abs(l);
    const aR = Math.abs(r);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
    sumSq += l * l + r * r;
  }
  const meanSq = sumSq / (n * 2);
  const rmsDb = meanSq <= 1e-20 ? -120 : linearToDb(Math.sqrt(meanSq));
  const peakDb = peak <= 1e-12 ? -120 : linearToDb(peak);
  return {
    trackId,
    role,
    rmsDb,
    peakDb,
    silent: peakDb < AUTO_BALANCE_SILENCE_PEAK_DB,
    frameCount: n,
  };
}

export function measureStemLevels(
  stems: readonly PlanarStemInput[],
  roleByTrackId: ReadonlyMap<string, string> | Record<string, string>,
): StemLevelMeasurement[] {
  const roleOf = (id: string): string => {
    if (roleByTrackId instanceof Map) return roleByTrackId.get(id) ?? "";
    return (roleByTrackId as Record<string, string>)[id] ?? "";
  };
  return stems.map((s) =>
    measurePlanarStemLevel(s.trackId, roleOf(s.trackId), s.left, s.right),
  );
}

/**
 * Conservative bus true-peak estimate: per-frame |L|+|R| sum with track gains.
 * Uses the shortest common length so unequal durations do not throw.
 */
export function estimateBusTruePeakDb(
  stems: readonly PlanarStemInput[],
  gainDbByTrackId: ReadonlyMap<string, number> | Record<string, number>,
): number {
  const gainOf = (id: string): number => {
    if (gainDbByTrackId instanceof Map) return gainDbByTrackId.get(id) ?? 0;
    return (gainDbByTrackId as Record<string, number>)[id] ?? 0;
  };

  if (stems.length === 0) return -120;

  const gains = stems.map((s) => dbToLinear(gainOf(s.trackId)));
  let frames = Number.POSITIVE_INFINITY;
  for (const s of stems) {
    frames = Math.min(frames, s.left.length, s.right.length);
  }
  if (!Number.isFinite(frames) || frames <= 0) return -120;

  // Cap work for long stems — sample uniformly across the file.
  const maxSamples = 48000 * 30; // 30 s @ 48 kHz
  const step = frames > maxSamples ? Math.ceil(frames / maxSamples) : 1;

  let peak = 0;
  for (let i = 0; i < frames; i += step) {
    let l = 0;
    let r = 0;
    for (let t = 0; t < stems.length; t++) {
      const s = stems[t]!;
      const g = gains[t]!;
      l += (s.left[i] ?? 0) * g;
      r += (s.right[i] ?? 0) * g;
    }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
  }
  return peak <= 1e-12 ? -120 : linearToDb(peak);
}

/**
 * Propose bounded starting gains from measured levels + role targets.
 * Does not mutate the mix. Custom / unknown roles are left unchanged.
 * Never boosts a weak bus without an explicit master trim limit (ceiling).
 */
export function proposeStemBalance(options: {
  tracks: readonly MixTrackForBalance[];
  measurements: readonly StemLevelMeasurement[];
  stems?: readonly PlanarStemInput[];
  gainMinDb?: number;
  gainMaxDb?: number;
  maxBoostDb?: number;
  busCeilingDb?: number;
}): AutoBalanceResult {
  const gainMin = options.gainMinDb ?? AUTO_BALANCE_GAIN_MIN_DB;
  const gainMax = options.gainMaxDb ?? AUTO_BALANCE_GAIN_MAX_DB;
  const maxBoost = options.maxBoostDb ?? AUTO_BALANCE_MAX_BOOST_DB;
  const busCeiling = options.busCeilingDb ?? AUTO_BALANCE_BUS_CEILING_DB;

  const byId = new Map(options.measurements.map((m) => [m.trackId, m]));
  let limitedBoost = false;

  const proposals: StemBalanceProposal[] = options.tracks.map((tr) => {
    const role = normalizeRole(tr.role);
    const measured =
      byId.get(tr.id) ??
      ({
        trackId: tr.id,
        role: tr.role,
        rmsDb: -120,
        peakDb: -120,
        silent: true,
        frameCount: 0,
      } satisfies StemLevelMeasurement);

    if (role === "user") {
      return {
        trackId: tr.id,
        role: tr.role,
        currentGainDb: tr.gainDb,
        proposedGainDb: tr.gainDb,
        deltaDb: 0,
        measured,
        note: "custom" as const,
      };
    }

    if (!isBalanceRole(role)) {
      return {
        trackId: tr.id,
        role: tr.role,
        currentGainDb: tr.gainDb,
        proposedGainDb: tr.gainDb,
        deltaDb: 0,
        measured,
        note: "unknown_role" as const,
      };
    }

    if (measured.silent) {
      return {
        trackId: tr.id,
        role: tr.role,
        currentGainDb: tr.gainDb,
        proposedGainDb: tr.gainDb,
        deltaDb: 0,
        measured,
        note: "silent" as const,
      };
    }

    const target = ROLE_TARGET_RMS_DB[role];
    let desired = target - measured.rmsDb;
    if (desired > maxBoost) {
      desired = maxBoost;
      limitedBoost = true;
    }
    const raw = tr.gainDb + desired;
    const clamped = clamp(raw, gainMin, gainMax);
    const proposedGainDb = roundDb(clamped);
    return {
      trackId: tr.id,
      role: tr.role,
      currentGainDb: tr.gainDb,
      proposedGainDb,
      deltaDb: roundDb(proposedGainDb - tr.gainDb),
      measured,
      note: proposedGainDb !== roundDb(raw) ? ("clamped" as const) : ("balanced" as const),
    };
  });

  const gainMap: Record<string, number> = {};
  for (const p of proposals) {
    gainMap[p.trackId] = p.proposedGainDb;
  }

  let estimatedBusPeakDb = -120;
  let masterTrimDb = 0;
  if (options.stems && options.stems.length > 0) {
    estimatedBusPeakDb = estimateBusTruePeakDb(options.stems, gainMap);
    if (estimatedBusPeakDb > busCeiling) {
      masterTrimDb = roundDb(busCeiling - estimatedBusPeakDb);
      limitedBoost = true;
      // Apply trim into track gains so preview/export stay consistent without
      // requiring a separate master change the user might miss.
      for (const p of proposals) {
        if (p.note === "custom" || p.note === "unknown_role" || p.note === "silent") {
          continue;
        }
        const next = roundDb(
          clamp(p.proposedGainDb + masterTrimDb, gainMin, gainMax),
        );
        p.deltaDb = roundDb(next - p.currentGainDb);
        p.proposedGainDb = next;
        p.note = "clamped";
        gainMap[p.trackId] = next;
      }
      estimatedBusPeakDb = estimateBusTruePeakDb(options.stems, gainMap);
    }
  }

  return {
    proposals,
    estimatedBusPeakDb,
    masterTrimDb,
    limitedBoost,
  };
}

/**
 * Apply confirmed proposals to a mix document (gains only).
 * Clips, pans, mute/solo, and custom / silent / unknown tracks stay as-is.
 */
export function applyStemBalanceProposals<
  TMix extends { tracks: MixTrackForBalance[] },
>(mix: TMix, proposals: readonly StemBalanceProposal[]): TMix {
  const byId = new Map(proposals.map((p) => [p.trackId, p]));
  return {
    ...mix,
    tracks: mix.tracks.map((tr) => {
      const p = byId.get(tr.id);
      if (!p) return tr;
      if (p.note === "custom" || p.note === "unknown_role" || p.note === "silent") {
        return tr;
      }
      return { ...tr, gainDb: p.proposedGainDb };
    }),
  };
}

/**
 * Playback loudness match: gain (dB) to add to B so it matches A’s integrated level.
 */
export function loudnessMatchGainDb(
  referenceIntegratedLufs: number,
  candidateIntegratedLufs: number,
): number {
  if (
    !Number.isFinite(referenceIntegratedLufs) ||
    !Number.isFinite(candidateIntegratedLufs)
  ) {
    return 0;
  }
  // Avoid huge boosts on near-silent candidates.
  if (candidateIntegratedLufs < -70) return 0;
  return roundDb(
    clamp(referenceIntegratedLufs - candidateIntegratedLufs, -12, 12),
  );
}
