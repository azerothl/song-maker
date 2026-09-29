import type { CotProfile, ScoreDocument, ScoreIssue } from "./score";
import { exportScoreAbc, validateScoreForGeneration } from "./score";

export type StaffAbcResult =
  | {
      ok: true;
      abc: string;
      warnings: string[];
      /** Cot used for display export only (not necessarily the generation cot). */
      displayCot: Exclude<CotProfile, "off">;
    }
  | {
      ok: false;
      abc: null;
      error: string;
      issues: ScoreIssue[];
    };

/**
 * Build ABC for staff rendering from a ScoreDocument.
 * Prefers cot=full so chords / Ins stay visible; falls back to melody.
 * Never invents notes — only exports what the model already holds.
 */
export function buildStaffAbc(
  document: ScoreDocument,
  title?: string,
): StaffAbcResult {
  const attempts: Array<Exclude<CotProfile, "off">> = ["full", "melody"];
  const collected: ScoreIssue[] = [];

  for (const cot of attempts) {
    const check = validateScoreForGeneration(document, cot);
    collected.push(...check.issues);
    if (!check.ok) continue;
    try {
      const { abc, warnings } = exportScoreAbc(
        document,
        cot,
        title || undefined,
      );
      if (!abc.trim()) {
        continue;
      }
      return {
        ok: true,
        abc: sanitizeAbcForStaffRender(abc),
        warnings: [
          ...warnings,
          ...check.issues
            .filter((i) => i.severity === "warning")
            .map((i) => i.message),
        ],
        displayCot: cot,
      };
    } catch (e) {
      collected.push({
        code: "validation_failed",
        severity: "error",
        message: String(e),
      });
    }
  }

  const firstError =
    collected.find((i) => i.severity === "error")?.message ??
    "Partition non exportable en ABC pour la portée.";
  return {
    ok: false,
    abc: null,
    error: firstError,
    issues: collected,
  };
}

/** Mesures d'une voix, dans l'ordre du document. */
export type AbcVoiceBlock = {
  /** Identifiant de voix, tel qu'il suit `V:`. */
  voice: string;
  bars: string[];
};

/** Structure d'un tune ABC, prête à être fenêtrée. */
export type AbcMeasureSplit = {
  /** Tout ce qui précède la première barre de mesure (X:, T:, K:, V:…). */
  header: string;
  /** Mesures par voix, dans l'ordre d'apparition. */
  blocks: AbcVoiceBlock[];
  /** Nombre de positions temporelles, soit la mesure la plus longue. */
  barCount: number;
  /**
   * `false` si le corps contient des repeats ou des barlines doubles.
   * Couper au milieu produirait un ABC invalide : l'appelant doit alors
   * composer le tune entier.
   */
  windowable: boolean;
};

/**
 * Barres qui ne sont pas de simples séparateurs : `|:`, `:|`, `[|`, `|]`,
 * et un `%` ouvrant un repeat en début de mesure. Un `%` de commentaire
 * n'apparaît que dans l'en-tête, jamais dans le corps.
 */
const UNSAFE_BARLINE = /\|\s*[:\]\[]|:\s*\||\[\s*\||\]\s*\||%\s*[:|]/;

/**
 * Déplie un repos multi-mesures (`Z4`) en une entrée par mesure.
 *
 * L'exporteur écrit `Z4` quand une voix est silencieuse sur un groupe, donc
 * deux voix n'ont pas le même nombre de mesures. Sans ce dépliage, une fenêtre
 * indexée par position temporelle désalignerait les parties.
 */
function expandBar(bar: string): string[] {
  const rest = bar.match(/^([Zz])(\d+)$/);
  if (rest) {
    return Array.from({ length: Math.max(1, Number(rest[2])) }, () => "Z");
  }
  return [bar];
}

/**
 * Découpe un tune ABC en en-tête + mesures par voix.
 *
 * `exportScoreAbc` alterne `V: <voix>` et des lignes de 4 mesures, jusqu'à
 * quatre fois pour la durée d'un morceau. Les mesures des deux voix sont donc
 * entrelacées, pas juxtaposées : une fenêtre doit tronquer chaque voix à la
 * même position temporelle, sinon l'ABC rendu désaligne les parties.
 */
export function splitAbcMeasures(abc: string): AbcMeasureSplit {
  const lines = abc.split(/\r?\n/).filter((l) => l.trim());
  const headerLines: string[] = [];
  const blocks: AbcVoiceBlock[] = [];
  const byVoice = new Map<string, AbcVoiceBlock>();
  const declared = new Set<string>();
  let current: AbcVoiceBlock | null = null;
  let windowable = true;
  let sawBar = false;

  for (const line of lines) {
    const voice = line.match(/^\s*V:\s*(\S+)/);
    if (voice) {
      const id = voice[1];
      // Première occurrence = définition (en-tête). Les suivantes sont des
      // re-sélections dans le corps, qui doivent changer la voix courante.
      if (!sawBar && !declared.has(id)) {
        declared.add(id);
        headerLines.push(line);
        continue;
      }
      declared.add(id);
      let block = byVoice.get(id);
      if (!block) {
        block = { voice: id, bars: [] };
        byVoice.set(id, block);
        blocks.push(block);
      }
      current = block;
      continue;
    }

    if (!line.includes("|")) {
      if (!sawBar) headerLines.push(line);
      continue;
    }

    sawBar = true;
    if (UNSAFE_BARLINE.test(line)) windowable = false;
    if (!current) {
      current = { voice: "1", bars: [] };
      byVoice.set("1", current);
      blocks.push(current);
    }
    for (const part of line.split("|")) {
      const bar = part.trim();
      if (bar) current.bars.push(...expandBar(bar));
    }
  }

  return {
    header: headerLines.join("\n"),
    blocks,
    barCount: blocks.reduce((max, b) => Math.max(max, b.bars.length), 0),
    windowable,
  };
}

/**
 * Durée d'une mesure en secondes, déduite de `M:` et `Q:`.
 *
 * abcjs recalcule la chronologie de la portée qu'il reçoit : sans ce décalage,
 * une fenêtre qui commence à la mesure 25 ferait correspondre 0 s à la
 * mesure 25, et le curseur de lecture comme le clic-pour-seek seraient faux.
 * Renvoie `null` si le tune ne déclare pas sa métrique, car on ne peut pas
 * alors fenêtrer sans désynchroniser la lecture.
 */
export function abcBarDurationSeconds(header: string): number | null {
  // `M:` accepte le suffixe `~` (mesure approximative) et `Q:` la forme
  // `Q:=120` sans fraction explicite.
  const meter = header.match(/^\s*M:\s*(\d+)\s*\/\s*(\d+)\s*~?\s*$/m);
  const tempo = header.match(/^\s*Q:\s*(?:\d+\s*\/\s*\d+\s*)?=?\s*(\d+(?:\.\d+)?)\s*$/m);
  if (!meter || !tempo) return null;

  const numerator = Number(meter[1]);
  const denominator = Number(meter[2]);
  const quarterBpm = Number(tempo[1]);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0 ||
    !Number.isFinite(quarterBpm) ||
    quarterBpm <= 0
  ) {
    return null;
  }

  // Une mesure vaut n/d temps, une noire 60/quarterBpm secondes.
  return ((numerator * 4) / denominator) * (60 / quarterBpm);
}

/**
 * Reconstruit un tune ABC limité à `count` mesures à partir de `start`.
 *
 * Chaque voix est tronquée à la même position temporelle, et les déclarations
 * `V:` de l'en-tête sont conservées : abcjs réassocie les parties correctement.
 * Aucun accord, tempo ou note n'est modifié. Un tune non `windowable` est
 * renvoyé intact, car on ne sait pas le couper sans le rendre invalide.
 */
export function sliceAbcMeasures(
  abc: string,
  start: number,
  count: number,
): string {
  const { header, blocks, barCount, windowable } = splitAbcMeasures(abc);
  if (barCount === 0) return header;
  if (!windowable) return abc;

  const from = Math.max(0, Math.min(start, Math.max(0, barCount - 1)));
  const body: string[] = [];
  for (const block of blocks) {
    const bars = block.bars.slice(from, from + count);
    if (bars.length === 0) continue;
    body.push(`V: ${block.voice}`);
    body.push(bars.map((b) => `${b}|`).join(""));
  }

  return [header, ...body].filter(Boolean).join("\n");
}

/** Multiplicateurs de durée (L:) admis par abcjs / YuE2 pour la portée. */
export const STAFF_REPRESENTABLE_DURATIONS = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48,
] as const;

export function isStaffRepresentableDuration(units: number): boolean {
  return (STAFF_REPRESENTABLE_DURATIONS as readonly number[]).includes(units);
}

/** Décompose une durée en somme de multiplicateurs admis (ex. 5 → [4, 1]). */
export function decomposeStaffDuration(units: number): number[] {
  if (units <= 0 || !Number.isInteger(units)) {
    throw new Error(`durée ABC invalide: ${units}`);
  }
  if (isStaffRepresentableDuration(units)) {
    return [units];
  }
  const allowed = [...STAFF_REPRESENTABLE_DURATIONS].sort((a, b) => b - a);
  const parts: number[] = [];
  let remaining = units;
  while (remaining > 0) {
    const pick = allowed.find((value) => value <= remaining);
    if (pick === undefined) {
      throw new Error(`durée ABC indécomposable: ${units}`);
    }
    parts.push(pick);
    remaining -= pick;
  }
  return parts;
}

function formatRestDurationParts(parts: number[]): string {
  return parts.map((p) => (p === 1 ? "z" : `z${p}`)).join("");
}

function formatNoteDurationParts(pitch: string, parts: number[]): string {
  if (parts.length === 0) return pitch;
  let out = pitch + (parts[0] === 1 ? "" : String(parts[0]));
  for (let i = 1; i < parts.length; i++) {
    const mult = parts[i]!;
    out += pitch + (mult === 1 ? "" : String(mult));
  }
  return out;
}

/** Corrige les durées non représentables dans le corps d'une mesure (ex. z5 → z4z). */
export function sanitizeAbcBarContent(content: string): string {
  let out = content;
  out = out.replace(/\bz(\d+)\b/g, (match, numStr: string) => {
    const units = Number(numStr);
    if (!Number.isFinite(units) || isStaffRepresentableDuration(units)) {
      return match;
    }
    return formatRestDurationParts(decomposeStaffDuration(units));
  });
  out = out.replace(
    /(\^|_|=)?([A-Ga-g][,']*)(\d+)/g,
    (match, acc: string | undefined, pitchBody: string, numStr: string) => {
      const units = Number(numStr);
      if (!Number.isFinite(units) || isStaffRepresentableDuration(units)) {
        return match;
      }
      const pitch = `${acc ?? ""}${pitchBody}`;
      return formatNoteDurationParts(pitch, decomposeStaffDuration(units));
    },
  );
  return out;
}

/**
 * Prépare l'ABC exporté pour abcjs : durées valides, sans toucher à l'en-tête
 * ni aux barres de repeat.
 */
export function sanitizeAbcForStaffRender(abc: string): string {
  return abc
    .split(/\r?\n/)
    .map((line) => {
      if (!line.includes("|")) return line;
      return line
        .split("|")
        .map((segment) => sanitizeAbcBarContent(segment))
        .join("|");
    })
    .join("\n");
}

const HTML_ENTITY: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/** Retire le balisage abcjs des messages d'avertissement (affichage utilisateur). */
export function plainTextStaffMessage(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, "");
  return withoutTags
    .replace(/&([a-z]+);/gi, (full, name: string) => {
      const decoded = HTML_ENTITY[name.toLowerCase()];
      return decoded ?? full;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export type StaffRenderWarningSummary = {
  /** Nombre de mesures ou segments signalés par abcjs. */
  issueCount: number;
  /** Texte technique, une entrée par avertissement. */
  details: string[];
};

/** Résume les avertissements abcjs pour l'UI (sans HTML). */
export function summarizeStaffRenderWarnings(
  warnings: string[],
): StaffRenderWarningSummary | null {
  if (warnings.length === 0) return null;
  const details = warnings.map(plainTextStaffMessage).filter(Boolean);
  if (details.length === 0) return null;

  const measureIndexes = new Set<number>();
  for (const line of details) {
    const hits = line.matchAll(/(?:^|\s)measure(?:\s+number)?\s*:?\s*(\d+)/gi);
    for (const hit of hits) {
      measureIndexes.add(Number(hit[1]));
    }
    const musicLine = line.match(/Music Line:(\d+):/i);
    if (musicLine) {
      measureIndexes.add(Number(musicLine[1]));
    }
  }

  const issueCount =
    measureIndexes.size > 0 ? measureIndexes.size : details.length;
  return { issueCount, details };
}
