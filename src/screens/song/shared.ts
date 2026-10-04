import type { FormInput } from "../../lib/types";
import { wantsAudioInput } from "../../lib/audioInput";
import { t } from "../../ui/i18n";

function formatDecimalOneFraction(n: number): string {
  const dec = t("production.num.decimal");
  return Math.abs(n).toFixed(1).replace(".", dec);
}

// Constantes, libellés et validations purs de l'écran chanson.
// Aucun état React ici : ces fonctions sont directement testables.
export const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const TONIC_LABELS: Record<string, string> = {
  C: "Do",
  "C#": "Do♯",
  D: "Ré",
  Eb: "Mi♭",
  E: "Mi",
  F: "Fa",
  "F#": "Fa♯",
  G: "Sol",
  Ab: "La♭",
  A: "La",
  Bb: "Si♭",
  B: "Si",
};
export const METERS = ["", "4/4", "3/4", "6/8", "2/4"];
export const DURATION_SEC_MIN = 30;
export const DURATION_SEC_MAX = 360;
export const DURATION_SEC_STEP = 30;

const TITLE_FORBIDDEN = /[/\\:*?"<>|]/;
export type AdvancedSettingsPage =
  | null
  | "index"
  | "sound"
  | "plan"
  | "key"
  | "meter"
  | "seed";
export type SongWorkspace = "create" | "score" | "production" | "versions";
export type ScoreMode = "edit" | "reprise";

export const WORKSPACES: SongWorkspace[] = [
  "create",
  "score",
  "production",
  "versions",
];

export const SCORE_MODES: ScoreMode[] = ["edit", "reprise"];

export type FormFieldErrors = {
  title?: string;
  style?: string;
  lyrics?: string;
  duration?: string;
  audioInput?: string;
};

export function workspaceLabel(space: SongWorkspace): string {
  switch (space) {
    case "create":
      return t("workspace.create");
    case "score":
      return t("workspace.score");
    case "production":
      return t("workspace.production");
    case "versions":
      return t("workspace.versions");
    default: {
      const _exhaustive: never = space;
      return _exhaustive;
    }
  }
}

export function workspaceTitle(space: SongWorkspace): string {
  switch (space) {
    case "create":
      return t("workspace.create.title");
    case "score":
      return t("workspace.score.title");
    case "production":
      return t("workspace.production.title");
    case "versions":
      return t("workspace.versions.title");
    default: {
      const _exhaustive: never = space;
      return _exhaustive;
    }
  }
}

export function workspaceIntro(space: SongWorkspace): string {
  switch (space) {
    case "create":
      return t("workspace.create.intro");
    case "score":
      return t("workspace.score.intro");
    case "production":
      return t("production.common.intro");
    case "versions":
      return t("workspace.versions.intro");
    default: {
      const _exhaustive: never = space;
      return _exhaustive;
    }
  }
}

export function scoreModeLabel(mode: ScoreMode): string {
  switch (mode) {
    case "edit":
      return t("workspace.score.mode.edit");
    case "reprise":
      return t("workspace.score.mode.reprise");
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function advancedSettingsTitle(page: Exclude<AdvancedSettingsPage, null>): string {
  switch (page) {
    case "index": return t("form.advanced");
    case "sound": return t("form.parameter.sound.title");
    case "plan": return t("form.parameter.plan.title");
    case "key": return t("form.parameter.key.title");
    case "meter": return t("form.parameter.meter.title");
    case "seed": return t("form.parameter.seed.title");
    default: {
      const _exhaustive: never = page;
      return _exhaustive;
    }
  }
}

export function advancedSettingsIntro(page: Exclude<AdvancedSettingsPage, null>): string {
  switch (page) {
    case "index": return t("form.advanced.hint");
    case "sound": return t("form.parameter.sound.intro");
    case "plan": return t("form.parameter.plan.intro");
    case "key": return t("form.parameter.key.intro");
    case "meter": return t("form.parameter.meter.intro");
    case "seed": return t("form.parameter.seed.intro");
    default: {
      const _exhaustive: never = page;
      return _exhaustive;
    }
  }
}

export function formatDurationLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function snapDurationSec(raw: number): number {
  const clamped = Math.min(DURATION_SEC_MAX, Math.max(DURATION_SEC_MIN, raw));
  return Math.round(clamped / DURATION_SEC_STEP) * DURATION_SEC_STEP;
}

/** Gain label for knobs using `production.num.decimal` and `production.unit.db`. */
export function formatGainDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  const unit = t("production.unit.db");
  const abs = formatDecimalOneFraction(rounded);
  if (rounded > 0) return `+${abs} ${unit}`;
  if (rounded < 0) return `−${abs} ${unit}`;
  return `${abs} ${unit}`;
}

/** Zoom readout, e.g. « ×2 » / « ×2.5 » (#225). */
export function formatClipZoomValue(zoom: number): string {
  const dec = t("production.num.decimal");
  const unit = t("production.unit.zoom");
  const raw = Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", dec);
  return `${unit}${raw}`;
}

/** Compact pan for knobs: « C », « G 20 », « D 35 » (−1…1 → 0…100). */
export function formatPan(pan: number): string {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 2) return t("mix.pan.compactCenter");
  if (pan < 0) return t("mix.pan.compactLeft", { value: pct });
  return t("mix.pan.compactRight", { value: pct });
}

/** Parse gain display text (« −3,0 », « 3.0 dB », « +1 ») back to dB. */
export function parseGainDb(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s*dB\s*$/i, "")
    .replace(/,/g, ".")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Parse pan display (« G 20 », « D35 », « C », « -0.2 ») to −1…1. */
export function parsePan(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  if (s === "c" || s === "centre" || s === "center" || s === "0") return 0;
  const compact = s.match(/^([gd])\s*(\d{1,3})$/i);
  if (compact) {
    const pct = Number.parseInt(compact[2]!, 10);
    if (!Number.isFinite(pct)) return null;
    const mag = Math.min(100, Math.max(0, pct)) / 100;
    return compact[1]!.toLowerCase() === "g" ? -mag : mag;
  }
  const left = s.match(/^(?:gauche|left|l)\s*([+\-]?\d+(?:\.\d+)?)/i);
  if (left) {
    const n = Number.parseFloat(left[1]!);
    return Number.isFinite(n) ? -Math.min(1, Math.abs(n > 1 ? n / 100 : n)) : null;
  }
  const right = s.match(/^(?:droite|right|r)\s*([+\-]?\d+(?:\.\d+)?)/i);
  if (right) {
    const n = Number.parseFloat(right[1]!);
    return Number.isFinite(n) ? Math.min(1, Math.abs(n > 1 ? n / 100 : n)) : null;
  }
  const num = Number.parseFloat(s.replace(/−/g, "-"));
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num) > 1) return Math.max(-1, Math.min(1, num / 100));
  return Math.max(-1, Math.min(1, num));
}

const KNOWN_WARNINGS = [
  "estimated-separation",
  "guitar-piano-unavailable",
  "experimental-guitar-piano",
  "piano-less-reliable",
  "bs-roformer-vocals-instrumental-only",
  "drums-bass-guitar-piano-unavailable",
] as const;

type KnownWarning = (typeof KNOWN_WARNINGS)[number];

function isKnownWarning(code: string): code is KnownWarning {
  return (KNOWN_WARNINGS as readonly string[]).includes(code);
}

export function warningLabel(code: string): string {
  if (!isKnownWarning(code)) return code;
  switch (code) {
    case "estimated-separation":
      return t("separation.warn.estimated");
    case "guitar-piano-unavailable":
      return t("separation.warn.guitarPianoUnavailable");
    case "experimental-guitar-piano":
      return t("separation.warn.experimentalGuitarPiano");
    case "piano-less-reliable":
      return t("separation.warn.pianoLessReliable");
    case "bs-roformer-vocals-instrumental-only":
      return t("separation.warn.bsRoformerOnly");
    case "drums-bass-guitar-piano-unavailable":
      return t("separation.warn.drumsBassUnavailable");
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function validateFormFields(form: FormInput): FormFieldErrors {
  const errors: FormFieldErrors = {};
  const title = form.title.trim();
  if (!title || title.length > 120 || title.endsWith(".") || TITLE_FORBIDDEN.test(title)) {
    errors.title = t("form.error.title");
  }
  if (!form.style.trim()) errors.style = t("form.error.style");
  const lyrics = form.lyrics.trim();
  if (lyrics.length > 4000) {
    errors.lyrics = form.instrumentalMode
      ? t("form.error.lyricsTooLong")
      : t("form.error.lyrics");
  } else if (!lyrics && !form.instrumentalMode) {
    errors.lyrics = t("form.error.lyrics");
  }
  const dur = form.targetDurationSec;
  if (
    !Number.isFinite(dur) ||
    dur < DURATION_SEC_MIN ||
    dur > DURATION_SEC_MAX ||
    dur % DURATION_SEC_STEP !== 0
  ) {
    errors.duration = t("form.error.duration");
  }
  if (wantsAudioInput(form)) {
    errors.audioInput = t("form.audioInput.incapacity");
  }
  return errors;
}

export function primaryFormError(errors: FormFieldErrors): string | null {
  return errors.title ?? errors.style ?? errors.lyrics ?? errors.duration ?? errors.audioInput ?? null;
}

export function soundSummaryValue(form: FormInput): string {
  const parts = [
    form.instrumentalMode ? t("form.instrumental.summary") : null,
    form.singingLanguage
      ? t("form.advanced.summaryLang", { value: form.singingLanguage })
      : null,
    form.tempoBpm != null
      ? t("form.advanced.summaryTempo", { bpm: form.tempoBpm })
      : null,
    t("form.advanced.summaryDuration", {
      duration: formatDurationLabel(form.targetDurationSec),
    }),
    form.preferFullLyrics
      ? t("form.advanced.summaryPreferLyrics")
      : t("form.advanced.summaryStrict"),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function advancedSettingsSummary(form: FormInput): string {
  const parts: string[] = [
    soundSummaryValue(form),
    t(
      form.cot === "off"
        ? "form.plan.off"
        : form.cot === "melody"
          ? "form.plan.melody"
          : "form.plan.full",
    ),
  ];
  if (form.key) {
    parts.push(
      `${TONIC_LABELS[form.key.tonic] ?? form.key.tonic} · ${t(form.key.mode === "minor" ? "form.key.minor" : "form.key.major")}`,
    );
  }
  if (form.meter) {
    parts.push(`${form.meter.numerator}/${form.meter.denominator}`);
  }
  if (form.seed != null) {
    parts.push(`seed ${form.seed}`);
  }
  return parts.join(" · ");
}
