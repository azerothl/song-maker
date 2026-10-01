import {
  applyMixPreset,
  applyStemBalanceProposals,
  proposeStemBalance,
  type AutoBalanceResult,
  type PlanarStemInput,
  type StemBalanceProposal,
  type StemLevelMeasurement,
  type TrackEffectSlot,
} from "@song-maker/mix-production";
import type { ScoreIssue } from "./score";
import type { MixDoc } from "./types";
import type { ProductionOverlay } from "./productionState";

/** Structured actions the production copilote may propose (MVP, local-only). */
export type ProductionProposalKind =
  | "rebalance_stems"
  | "apply_preset"
  | "set_track_effects"
  | "score_fix_hint"
  | "save_mix_version";

export type ProductionChange =
  | {
      type: "gain";
      trackId: string;
      trackName: string;
      fromDb: number;
      toDb: number;
    }
  | {
      type: "master_trim";
      fromDb: number;
      toDb: number;
    }
  | {
      type: "preset";
      presetId: string;
      touches: ReadonlyArray<"gain" | "pan" | "effects">;
    }
  | {
      type: "effects";
      trackId: string;
      trackName: string;
      effects: TrackEffectSlot[];
    }
  | {
      type: "score_hint";
      issueCode: string;
      hintFr: string;
    }
  | {
      type: "save_version";
    };

export type ProductionProposal = {
  id: string;
  kind: ProductionProposalKind;
  titleFr: string;
  findingFr: string;
  expectedFr: string;
  changes: ProductionChange[];
  /** Gain/pan MixDoc preview is possible. Effects need overlay preview (deferred). */
  previewable: boolean;
  /** Can mutate mix/overlay from this panel after explicit confirm. */
  autoApplicable: boolean;
  selectedByDefault: boolean;
};

export type ProductionAnalysis = {
  mixId: string;
  fingerprint: string;
  analyzedAtIso: string;
  proposals: ProductionProposal[];
  balanceResult: AutoBalanceResult | null;
  /** Always false in MVP — remote analysis is opt-in and not implemented. */
  remoteAnalysis: false;
  limitsFr: string;
};

export type AnalyzeProductionInput = {
  mix: MixDoc;
  overlay: ProductionOverlay | null;
  measurements?: readonly StemLevelMeasurement[];
  stems?: readonly PlanarStemInput[];
  scoreIssues?: readonly ScoreIssue[];
};

export type ApplyProductionInput = {
  mix: MixDoc;
  overlay: ProductionOverlay | null;
  analysis: ProductionAnalysis;
  /** Proposal ids the user checked. */
  selectedIds: readonly string[];
  /** Current fingerprint — must match analysis.fingerprint. */
  currentFingerprint: string;
};

export type ApplyProductionResult =
  | {
      ok: true;
      mix: MixDoc;
      effectsByTrack: Record<string, TrackEffectSlot[]>;
      /** True when the caller should offer / call saveMixVersion. */
      wantSaveVersion: boolean;
      appliedIds: string[];
      messageFr: string;
    }
  | {
      ok: false;
      reasonFr: string;
    };

const LIMITS_FR =
  "Analyse locale heuristique uniquement. Aucune garantie de qualité mix, " +
  "de conformité stylistique ni de mastering professionnel. Les effets " +
  "proposés ne sont pas préécoutables A/B dans ce MVP (gains seuls).";

/**
 * Stable fingerprint of mix levels + overlay FX for stale-proposal rejection.
 * Independent of mix.id (id only changes on save-version).
 */
export function fingerprintProductionState(
  mix: Pick<MixDoc, "id" | "masterGainDb" | "tracks">,
  overlay: ProductionOverlay | null,
): string {
  const tracks = mix.tracks.map((tr) => ({
    id: tr.id,
    role: tr.role,
    gainDb: round1(tr.gainDb),
    pan: round2(tr.pan),
    mute: tr.mute,
    solo: tr.solo,
    clipCount: tr.clips.length,
  }));
  const fx: Record<string, unknown> = {};
  if (overlay && overlay.mixId === mix.id) {
    for (const [trackId, slots] of Object.entries(overlay.effectsByTrack)) {
      fx[trackId] = slots.map((s) => ({
        id: s.id,
        kind: s.kind,
        enabled: s.enabled,
        params: s.params,
      }));
    }
  }
  const payload = JSON.stringify({
    mixId: mix.id,
    masterGainDb: round1(mix.masterGainDb),
    tracks,
    fx,
  });
  return `v1:${fnv1aHex(payload)}`;
}

export function assertAnalysisStillValid(
  analysis: ProductionAnalysis,
  currentFingerprint: string,
): { ok: true } | { ok: false; reasonFr: string } {
  if (analysis.fingerprint !== currentFingerprint) {
    return {
      ok: false,
      reasonFr:
        "Le mix a changé depuis l’analyse. Relancez l’analyse — la proposition est rejetée sans modification.",
    };
  }
  return { ok: true };
}

/**
 * Local rule-based production copilote (#97).
 * Never mutates — callers apply after explicit confirmation.
 */
export function analyzeProduction(
  input: AnalyzeProductionInput,
): ProductionAnalysis {
  const { mix, overlay, measurements, stems, scoreIssues } = input;
  const fingerprint = fingerprintProductionState(mix, overlay);
  const proposals: ProductionProposal[] = [];
  let balanceResult: AutoBalanceResult | null = null;

  if (measurements && measurements.length > 0) {
    balanceResult = proposeStemBalance({
      tracks: mix.tracks,
      measurements,
      stems,
    });
    const meaningful = balanceResult.proposals.filter(
      (p) => Math.abs(p.deltaDb) >= 0.5,
    );
    if (meaningful.length > 0) {
      const changes: ProductionChange[] = meaningful.map((p) => ({
        type: "gain" as const,
        trackId: p.trackId,
        trackName: trackName(mix, p.trackId),
        fromDb: p.currentGainDb,
        toDb: p.proposedGainDb,
      }));
      if (Math.abs(balanceResult.masterTrimDb) >= 0.1) {
        changes.push({
          type: "master_trim",
          fromDb: mix.masterGainDb,
          toDb: round1(mix.masterGainDb + balanceResult.masterTrimDb),
        });
      }
      proposals.push({
        id: "rebalance_stems",
        kind: "rebalance_stems",
        titleFr: "Rééquilibrer les stems",
        findingFr: findBalanceFinding(meaningful, balanceResult),
        expectedFr:
          "Ajuster les gains de piste (bornés) pour se rapprocher des cibles de rôle. " +
          "Préécoute A/B disponible avant application.",
        changes,
        previewable: true,
        autoApplicable: true,
        selectedByDefault: true,
      });
    }
  }

  const vocals = mix.tracks.find(
    (tr) => normalizeRole(tr.role) === "vocals" || normalizeRole(tr.role) === "vocal",
  );
  if (vocals) {
    const vocalFx = overlay?.effectsByTrack[vocals.id] ?? [];
    const hasComp = vocalFx.some(
      (s) => s.kind === "compressor" && s.enabled,
    );
    const vocalMeas = measurements?.find((m) => m.trackId === vocals.id);
    const vocalsQuiet =
      vocalMeas &&
      !vocalMeas.silent &&
      vocalMeas.rmsDb < -22 &&
      vocals.gainDb < 2;

    if (vocalsQuiet || !hasComp) {
      const presetId = "vocals-forward";
      proposals.push({
        id: `preset:${presetId}`,
        kind: "apply_preset",
        titleFr: "Preset « Voix en avant »",
        findingFr: vocalsQuiet
          ? `La piste voix (« ${vocals.name} ») est relativement basse (RMS ${vocalMeas ? vocalMeas.rmsDb.toFixed(1) : "?"} dB).`
          : `Aucun compresseur actif sur « ${vocals.name} ».`,
        expectedFr:
          "Appliquer le preset d’intention voix (gains, pans, compresseur + EQ plateau). " +
          "Les effets s’appliquent immédiatement à la confirmation — pas de préécoute A/B des FX dans ce MVP.",
        changes: [
          {
            type: "preset",
            presetId,
            touches: ["gain", "pan", "effects"],
          },
        ],
        previewable: false,
        autoApplicable: true,
        selectedByDefault: false,
      });
    }

    if (!hasComp) {
      const effects: TrackEffectSlot[] = [
        {
          id: "copilot-vocals-comp",
          kind: "compressor",
          enabled: true,
          params: { thresholdDb: -18, ratio: 2.5, makeupDb: 1 },
        },
      ];
      proposals.push({
        id: `effects:vocals-comp:${vocals.id}`,
        kind: "set_track_effects",
        titleFr: "Compresseur léger sur la voix",
        findingFr: `Pas de compresseur sur « ${vocals.name} ».`,
        expectedFr:
          "Activer un compresseur doux (seuil −18 dB, ratio 2,5). Non préécoutable A/B ici ; annulable via restauration du snapshot.",
        changes: [
          {
            type: "effects",
            trackId: vocals.id,
            trackName: vocals.name,
            effects,
          },
        ],
        previewable: false,
        autoApplicable: true,
        selectedByDefault: false,
      });
    }
  }

  if (scoreIssues && scoreIssues.length > 0) {
    const first = scoreIssues[0]!;
    proposals.push({
      id: `score_hint:${first.code}`,
      kind: "score_fix_hint",
      titleFr: "Revoir la partition",
      findingFr: `${scoreIssues.length} problème(s) de partition détecté(s) (ex. ${first.code}).`,
      expectedFr:
        "Ouvrir l’onglet Partition et utiliser l’assistant de validation ABC. " +
        "Cette proposition n’altère pas le mix.",
      changes: [
        {
          type: "score_hint",
          issueCode: first.code,
          hintFr: first.message,
        },
      ],
      previewable: false,
      autoApplicable: false,
      selectedByDefault: false,
    });
  }

  if (proposals.some((p) => p.autoApplicable)) {
    proposals.push({
      id: "save_mix_version",
      kind: "save_mix_version",
      titleFr: "Enregistrer comme nouvelle version",
      findingFr:
        "Après application, conserver un point de restauration nommé dans le graphe de versions.",
      expectedFr:
        "Appeler « Enregistrer le mix » (nouveau mix-v*) une fois les changements confirmés.",
      changes: [{ type: "save_version" }],
      previewable: false,
      autoApplicable: false,
      selectedByDefault: true,
    });
  }

  return {
    mixId: mix.id,
    fingerprint,
    analyzedAtIso: new Date().toISOString(),
    proposals,
    balanceResult,
    remoteAnalysis: false,
    limitsFr: LIMITS_FR,
  };
}

/**
 * Apply checked auto-applicable proposals. Rejects on fingerprint mismatch
 * without mutating mix/overlay.
 */
export function applySelectedProposals(
  input: ApplyProductionInput,
): ApplyProductionResult {
  const pin = assertAnalysisStillValid(
    input.analysis,
    input.currentFingerprint,
  );
  if (!pin.ok) return pin;

  if (input.analysis.mixId !== input.mix.id) {
    return {
      ok: false,
      reasonFr:
        "La proposition vise un autre mix (id différent). Relancez l’analyse.",
    };
  }

  const selected = new Set(input.selectedIds);
  const toApply = input.analysis.proposals.filter(
    (p) => selected.has(p.id) && p.autoApplicable,
  );
  if (toApply.length === 0) {
    return {
      ok: false,
      reasonFr: "Aucune proposition applicable sélectionnée.",
    };
  }

  let mix = cloneMix(input.mix);
  const effectsByTrack: Record<string, TrackEffectSlot[]> = {};
  const appliedIds: string[] = [];

  // Presets first (absolute levels), then selective rebalance, then FX.
  const order: ProductionProposalKind[] = [
    "apply_preset",
    "rebalance_stems",
    "set_track_effects",
  ];
  for (const kind of order) {
    for (const proposal of toApply.filter((p) => p.kind === kind)) {
      switch (proposal.kind) {
        case "apply_preset": {
          const presetChange = proposal.changes.find((c) => c.type === "preset");
          if (!presetChange || presetChange.type !== "preset") break;
          const applied = applyMixPreset(mix, presetChange.presetId);
          mix = applied.mix as MixDoc;
          Object.assign(effectsByTrack, applied.effectsByTrack);
          appliedIds.push(proposal.id);
          break;
        }
        case "rebalance_stems": {
          const balance = input.analysis.balanceResult;
          if (!balance) break;
          const gainIds = new Set(
            proposal.changes
              .filter((c): c is Extract<ProductionChange, { type: "gain" }> =>
                c.type === "gain",
              )
              .map((c) => c.trackId),
          );
          const filtered: StemBalanceProposal[] = balance.proposals.map((p) => {
            if (!gainIds.has(p.trackId)) {
              return {
                ...p,
                proposedGainDb: p.currentGainDb,
                deltaDb: 0,
                note: p.note,
              };
            }
            return p;
          });
          mix = applyStemBalanceProposals(mix, filtered);
          const trim = proposal.changes.find((c) => c.type === "master_trim");
          if (trim && trim.type === "master_trim") {
            mix = { ...mix, masterGainDb: trim.toDb };
          }
          appliedIds.push(proposal.id);
          break;
        }
        case "set_track_effects": {
          for (const change of proposal.changes) {
            if (change.type !== "effects") continue;
            effectsByTrack[change.trackId] = change.effects.map((e) => ({
              ...e,
              params: { ...e.params },
            }));
          }
          appliedIds.push(proposal.id);
          break;
        }
        case "score_fix_hint":
        case "save_mix_version":
          break;
        default: {
          const _exhaustive: never = proposal.kind;
          void _exhaustive;
          break;
        }
      }
    }
  }

  const wantSaveVersion = selected.has("save_mix_version");
  return {
    ok: true,
    mix,
    effectsByTrack,
    wantSaveVersion,
    appliedIds,
    messageFr: `${appliedIds.length} proposition(s) appliquée(s).`,
  };
}

/** Build a MixDoc preview for A/B of selected previewable proposals. */
export function previewMixFromProposals(
  mix: MixDoc,
  analysis: ProductionAnalysis,
  selectedIds: readonly string[],
): MixDoc | null {
  const selected = new Set(selectedIds);
  const rebalance = analysis.proposals.find(
    (p) =>
      p.id === "rebalance_stems" &&
      selected.has(p.id) &&
      p.previewable &&
      analysis.balanceResult,
  );
  if (!rebalance || !analysis.balanceResult) return null;

  const gainIds = new Set(
    rebalance.changes
      .filter((c): c is Extract<ProductionChange, { type: "gain" }> =>
        c.type === "gain",
      )
      .map((c) => c.trackId),
  );
  const filtered = analysis.balanceResult.proposals.map((p) => {
    if (!gainIds.has(p.trackId)) {
      return { ...p, proposedGainDb: p.currentGainDb, deltaDb: 0 };
    }
    return p;
  });
  let next = applyStemBalanceProposals(cloneMix(mix), filtered);
  const trim = rebalance.changes.find((c) => c.type === "master_trim");
  if (trim && trim.type === "master_trim") {
    next = { ...next, masterGainDb: trim.toDb };
  }
  return next;
}

function findBalanceFinding(
  meaningful: StemBalanceProposal[],
  result: AutoBalanceResult,
): string {
  const parts = meaningful.slice(0, 3).map((p) => {
    const sign = p.deltaDb > 0 ? "+" : "";
    return `${p.role} ${sign}${p.deltaDb.toFixed(1)} dB`;
  });
  const more =
    meaningful.length > 3 ? ` (+${meaningful.length - 3} autres)` : "";
  return (
    `Écarts de niveau détectés : ${parts.join(", ")}${more}. ` +
    `Crête bus estimée ${result.estimatedBusPeakDb.toFixed(1)} dBFS` +
    (result.limitedBoost ? " (boost limité)" : "") +
    "."
  );
}

function trackName(mix: MixDoc, trackId: string): string {
  return mix.tracks.find((tr) => tr.id === trackId)?.name ?? trackId;
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function cloneMix(mix: MixDoc): MixDoc {
  return JSON.parse(JSON.stringify(mix)) as MixDoc;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** FNV-1a 32-bit → 8 hex chars. */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
