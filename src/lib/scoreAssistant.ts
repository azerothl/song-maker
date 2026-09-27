import type { ScoreIssue } from "./score";
import { quantizeScore, type ScoreDocument } from "./score";

export type ScoreFixActionId =
  | "quantize_120"
  | "set_cot_full"
  | "clamp_pitches"
  | "remove_overlaps_hint"
  | "add_tempo"
  | "fix_chords_hint"
  | "none";

export type ScoreFixSuggestion = {
  issueCode: string;
  titleFr: string;
  detailFr: string;
  actionId: ScoreFixActionId;
  /** When true, applySuggestion can mutate the document. */
  autoApplicable: boolean;
};

const TICKS_THIRTY_SECOND = 120;

/**
 * Suggest fixes from score-engine validation issues (phase 4 assistant).
 * Rule-based — not an LLM agent.
 */
export function suggestFixesFromIssues(
  issues: readonly ScoreIssue[],
): ScoreFixSuggestion[] {
  const seen = new Set<string>();
  const out: ScoreFixSuggestion[] = [];

  for (const issue of issues) {
    if (seen.has(issue.code)) continue;
    seen.add(issue.code);
    const suggestion = suggestionForCode(issue);
    if (suggestion) out.push(suggestion);
  }
  return out;
}

function suggestionForCode(issue: ScoreIssue): ScoreFixSuggestion | null {
  switch (issue.code) {
    case "unaligned_duration":
      return {
        issueCode: issue.code,
        titleFr: "Quantifier les durées",
        detailFr:
          "Aligner les notes sur la grille triple-croche (120 ticks) pour l’export ABC YuE2.",
        actionId: "quantize_120",
        autoApplicable: true,
      };
    case "abc_with_cot_off":
      return {
        issueCode: issue.code,
        titleFr: "Passer cot en full ou melody",
        detailFr:
          "Un ABC avec cot=off est interdit. Choisissez full (défaut) ou melody dans le formulaire.",
        actionId: "set_cot_full",
        autoApplicable: false,
      };
    case "pitch_out_of_range":
    case "pitch_out_of_reasonable_range":
      return {
        issueCode: issue.code,
        titleFr: "Corriger les hauteurs hors plage",
        detailFr:
          "Ramener les notes MIDI dans une plage raisonnable pour la voix (clamp automatique disponible).",
        actionId: "clamp_pitches",
        autoApplicable: true,
      };
    case "overlapping_vocal_notes":
    case "midi_overlapping_notes":
      return {
        issueCode: issue.code,
        titleFr: "Résoudre les chevauchements",
        detailFr:
          "Deux notes Vocal se chevauchent. Raccourcissez ou décalez l’une d’elles dans le piano roll.",
        actionId: "remove_overlaps_hint",
        autoApplicable: false,
      };
    case "missing_tempo":
    case "invalid_tempo":
      return {
        issueCode: issue.code,
        titleFr: "Définir un tempo",
        detailFr: "Ajouter un tempo de partition (ex. 120 BPM) avant l’export ABC.",
        actionId: "add_tempo",
        autoApplicable: true,
      };
    case "invalid_chord":
      return {
        issueCode: issue.code,
        titleFr: "Corriger les accords",
        detailFr:
          "Symbole d’accord hors dialecte YuE2. Utilisez des symboles acceptés (C, Am, G7…).",
        actionId: "fix_chords_hint",
        autoApplicable: false,
      };
    case "third_abc_voice":
      return {
        issueCode: issue.code,
        titleFr: "Limiter à Vocal / Ins",
        detailFr:
          "YuE2 n’accepte que les voix Vocal et Ins. Retirez ou réaffectez la troisième voix.",
        actionId: "none",
        autoApplicable: false,
      };
    case "dialect_forbidden":
      return {
        issueCode: issue.code,
        titleFr: "Respecter le dialecte ABC",
        detailFr: issue.message,
        actionId: "none",
        autoApplicable: false,
      };
    default:
      return {
        issueCode: issue.code,
        titleFr: "Vérifier la partition",
        detailFr: issue.message,
        actionId: "none",
        autoApplicable: false,
      };
  }
}

export type ApplyFixResult = {
  document: ScoreDocument;
  messageFr: string;
};

/**
 * Apply an auto-applicable suggestion to a ScoreDocument.
 */
export function applyScoreFix(
  document: ScoreDocument,
  actionId: ScoreFixActionId,
): ApplyFixResult | null {
  switch (actionId) {
    case "quantize_120":
      return {
        document: quantizeScore(document, TICKS_THIRTY_SECOND),
        messageFr: "Partition quantifiée sur 120 ticks.",
      };
    case "clamp_pitches": {
      const next: ScoreDocument = {
        ...document,
        version: document.version + 1,
        voices: document.voices.map((v) => ({
          ...v,
          notes: v.notes.map((n) => ({
            ...n,
            pitch: Math.min(84, Math.max(36, n.pitch)),
          })),
        })),
      };
      return {
        document: next,
        messageFr: "Hauteurs ramenées dans la plage 36–84.",
      };
    }
    case "add_tempo": {
      const bpm =
        document.tempoMap[0]?.quarterBpm && document.tempoMap[0].quarterBpm > 0
          ? document.tempoMap[0].quarterBpm
          : 120;
      return {
        document: {
          ...document,
          version: document.version + 1,
          tempoMap: [{ tick: 0, quarterBpm: bpm }],
        },
        messageFr: `Tempo défini à ${bpm} BPM.`,
      };
    }
    case "set_cot_full":
    case "remove_overlaps_hint":
    case "fix_chords_hint":
    case "none":
      return null;
    default: {
      const _exhaustive: never = actionId;
      void _exhaustive;
      return null;
    }
  }
}
