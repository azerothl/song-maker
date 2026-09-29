import type { FormInput } from "../../lib/types";
import { t } from "../../ui/i18n";

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
export type ProductionView = "mix" | "clips" | "tools";
export type ScoreMode = "edit" | "reprise";

export const WORKSPACES: SongWorkspace[] = [
  "create",
  "score",
  "production",
  "versions",
];

export const PRODUCTION_VIEWS: ProductionView[] = ["mix", "clips", "tools"];
export const SCORE_MODES: ScoreMode[] = ["edit", "reprise"];

export type FormFieldErrors = {
  title?: string;
  style?: string;
  lyrics?: string;
  duration?: string;
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
      return t("workspace.production.intro");
    case "versions":
      return t("workspace.versions.intro");
    default: {
      const _exhaustive: never = space;
      return _exhaustive;
    }
  }
}

export function productionViewLabel(view: ProductionView): string {
  switch (view) {
    case "mix":
      return t("workspace.production.mix");
    case "clips":
      return t("workspace.production.clips");
    case "tools":
      return t("workspace.production.tools");
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

export function productionViewIntro(view: ProductionView): string {
  switch (view) {
    case "mix":
      return t("workspace.production.mix.intro");
    case "clips":
      return t("workspace.production.clips.intro");
    case "tools":
      return t("workspace.production.tools.intro");
    default: {
      const _exhaustive: never = view;
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

export function formatGainDb(db: number): string {
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.02) return t("mix.pan.center");
  if (pan < 0) return t("mix.pan.left", { value: Math.abs(pan).toFixed(2) });
  return t("mix.pan.right", { value: pan.toFixed(2) });
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
  return errors;
}

export function primaryFormError(errors: FormFieldErrors): string | null {
  return errors.title ?? errors.style ?? errors.lyrics ?? errors.duration ?? null;
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
