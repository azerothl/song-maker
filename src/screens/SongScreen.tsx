import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BuiltRemotePayload,
  RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import { AudioPlayer, type PlaybackView } from "../components/AudioPlayer";
import { CandidateCompare } from "../components/CandidateCompare";
import { ClipTimeline } from "../components/ClipTimeline";
import { MixAssistPanel } from "../components/MixAssistPanel";
import { MultiRenderFromScore } from "../components/MultiRenderFromScore";
import { Phase3MixPanel } from "../components/Phase3MixPanel";
import { RecordTrackPanel } from "../components/RecordTrackPanel";
import { RegenerationGate } from "../components/RegenerationGate";
import { RemoteGenerateConfirm } from "../components/RemoteGenerateConfirm";
import { ScoreOnlyGenerate } from "../components/ScoreOnlyGenerate";
import { ScorePanel } from "../components/ScorePanel";
import { SheetSage2Panel } from "../components/SheetSage2Panel";
import { VersionGraph } from "../components/VersionGraph";
import { Waveform } from "../components/Waveform";
import { api } from "../lib/api";
import { exportProjectAudio } from "../lib/exportMix";
import { loadInvariantBaseline } from "../lib/invariants";
import {
  buildGenerationPayload,
  loadRemotePrefs,
  runRemoteGenerationToProject,
} from "../lib/remoteGenerate";
import { ensureProductionOverlay } from "../lib/productionState";
import {
  prepareAbcForGeneration,
  type ScoreDocument,
} from "../lib/score";
import {
  generateScoreOnly,
  renderNFromScore,
} from "../lib/scoreOnlyApi";
import type { FormInput, MixDoc, MixTrack, SeparationInfo } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TONIC_LABELS: Record<string, string> = {
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
const METERS = ["", "4/4", "3/4", "6/8", "2/4"];
const DURATION_SEC_MIN = 30;
const DURATION_SEC_MAX = 360;
const DURATION_SEC_STEP = 30;

const TITLE_FORBIDDEN = /[/\\:*?"<>|]/;
type AdvancedSettingsPage =
  | null
  | "index"
  | "sound"
  | "plan"
  | "key"
  | "meter"
  | "seed";
type SongWorkspace = "create" | "score" | "production" | "versions";
type ProductionView = "mix" | "clips" | "tools";
type ScoreMode = "edit" | "reprise";

const WORKSPACES: SongWorkspace[] = [
  "create",
  "score",
  "production",
  "versions",
];

const PRODUCTION_VIEWS: ProductionView[] = ["mix", "clips", "tools"];
const SCORE_MODES: ScoreMode[] = ["edit", "reprise"];

type FormFieldErrors = {
  title?: string;
  style?: string;
  lyrics?: string;
  duration?: string;
};

function workspaceLabel(space: SongWorkspace): string {
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

function workspaceTitle(space: SongWorkspace): string {
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

function workspaceIntro(space: SongWorkspace): string {
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

function productionViewLabel(view: ProductionView): string {
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

function productionViewIntro(view: ProductionView): string {
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

function scoreModeLabel(mode: ScoreMode): string {
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

function advancedSettingsTitle(page: Exclude<AdvancedSettingsPage, null>): string {
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

function advancedSettingsIntro(page: Exclude<AdvancedSettingsPage, null>): string {
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

function formatDurationLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function snapDurationSec(raw: number): number {
  const clamped = Math.min(DURATION_SEC_MAX, Math.max(DURATION_SEC_MIN, raw));
  return Math.round(clamped / DURATION_SEC_STEP) * DURATION_SEC_STEP;
}

function formatGainDb(db: number): string {
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

function formatPan(pan: number): string {
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

function warningLabel(code: string): string {
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

function validateFormFields(form: FormInput): FormFieldErrors {
  const errors: FormFieldErrors = {};
  const title = form.title.trim();
  if (!title || title.length > 120 || title.endsWith(".") || TITLE_FORBIDDEN.test(title)) {
    errors.title = t("form.error.title");
  }
  if (!form.style.trim()) errors.style = t("form.error.style");
  const lyrics = form.lyrics.trim();
  if (!lyrics || lyrics.length > 4000) errors.lyrics = t("form.error.lyrics");
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

function primaryFormError(errors: FormFieldErrors): string | null {
  return errors.title ?? errors.style ?? errors.lyrics ?? errors.duration ?? null;
}

function soundSummaryValue(form: FormInput): string {
  const parts = [
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

function advancedSettingsSummary(form: FormInput): string {
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

export function SongScreen() {
  const project = useAppStore((s) => s.project);
  const form = useAppStore((s) => s.form);
  const setForm = useAppStore((s) => s.setForm);
  const mix = useAppStore((s) => s.mix);
  const setMix = useAppStore((s) => s.setMix);
  const generations = useAppStore((s) => s.generations);
  const scoreAbc = useAppStore((s) => s.scoreAbc);
  const scoreDocument = useAppStore((s) => s.scoreDocument);
  const setScoreDocument = useAppStore((s) => s.setScoreDocument);
  const scoreOpen = useAppStore((s) => s.scoreOpen);
  const setScoreOpen = useAppStore((s) => s.setScoreOpen);
  const playbackSources = useAppStore((s) => s.playbackSources);
  const setError = useAppStore((s) => s.setError);
  const openProject = useAppStore((s) => s.openProject);
  const job = useAppStore((s) => s.job);

  const [busy, setBusy] = useState(false);
  const [showFormErrors, setShowFormErrors] = useState(false);
  const [playback, setPlayback] = useState<PlaybackView | null>(null);
  const [candidateCount, setCandidateCount] = useState(2);
  const [renderFromScoreCount, setRenderFromScoreCount] = useState(2);
  const [continuationLyrics, setContinuationLyrics] = useState("");
  const [remoteConfirmOpen, setRemoteConfirmOpen] = useState(false);
  const [remotePrefs, setRemotePrefs] = useState<RemoteWorkerPreferences | null>(
    null,
  );
  const [remotePayload, setRemotePayload] = useState<BuiltRemotePayload | null>(
    null,
  );
  const [advancedSettingsPage, setAdvancedSettingsPage] =
    useState<AdvancedSettingsPage>(null);
  const [workspace, setWorkspace] = useState<SongWorkspace>("create");
  const [productionView, setProductionView] = useState<ProductionView>("mix");
  const [scoreMode, setScoreMode] = useState<ScoreMode>("edit");
  const [separationInfo, setSeparationInfo] = useState<SeparationInfo | null>(
    null,
  );
  const [importingAudio, setImportingAudio] = useState(false);
  const [mixPreview, setMixPreview] = useState<MixDoc | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [regenGateOpen, setRegenGateOpen] = useState(false);
  const [regenAfterDocument, setRegenAfterDocument] =
    useState<ScoreDocument | null>(null);
  const [regenBaselineDoc, setRegenBaselineDoc] =
    useState<ScoreDocument | null>(null);
  const saveTimer = useRef<number | null>(null);
  const mixTimer = useRef<number | null>(null);

  async function onImportUserAudio() {
    if (!project || importingAudio) return;
    setImportingAudio(true);
    setError(null);
    try {
      const next = await api.importUserAudioTrack(project.id);
      if (next) {
        setMix(next);
        await openProject(project.id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImportingAudio(false);
    }
  }

  async function onUserTrackAdded(next: MixDoc) {
    setMix(next);
    if (project) await openProject(project.id);
  }

  async function onExport(format: "wav" | "flac" | "mp3") {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const path = await exportProjectAudio(
        project.id,
        format,
        mix,
        playbackSources,
      );
      window.alert(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const formFieldErrors = useMemo(() => validateFormFields(form), [form]);
  const formError = useMemo(
    () => primaryFormError(formFieldErrors),
    [formFieldErrors],
  );
  const advancedSummary = useMemo(() => advancedSettingsSummary(form), [form]);
  const scoreGate = useMemo(
    () => prepareAbcForGeneration(scoreDocument, form.cot, form.title),
    [scoreDocument, form.cot, form.title],
  );
  const canGenerate = !formError && !busy && !scoreGate.error;
  /** Score-only forbids external ABC and cot=off. */
  const canGenerateScoreOnly =
    !formError && form.cot !== "off" && !scoreGate.abc;

  useEffect(() => {
    setShowFormErrors(false);
    setRegenGateOpen(false);
    setRegenAfterDocument(null);
    setRegenBaselineDoc(null);
    setWorkspace("create");
    setAdvancedSettingsPage(null);
    setProductionView("mix");
    setScoreMode("edit");
  }, [project?.id]);

  function selectWorkspace(next: SongWorkspace) {
    setWorkspace(next);
    if (next !== "create") setAdvancedSettingsPage(null);
  }

  useEffect(() => {
    if (!project?.id) return;
    loadInvariantBaseline(project.id);
  }, [project?.id]);

  useEffect(() => {
    if (!mix?.id) return;
    ensureProductionOverlay(mix.id);
  }, [mix?.id]);

  const roleByTrack = useMemo(() => {
    const out: Record<string, string> = {};
    if (!mix) return out;
    for (const tr of mix.tracks) {
      out[tr.id] = tr.role.toLowerCase();
    }
    return out;
  }, [mix]);

  const sourceDurationMsByTrack = useMemo(() => {
    const out: Record<string, number> = {};
    if (!mix || !playback?.duration || playback.duration <= 0) return out;
    const ms = Math.round(playback.duration * 1000);
    for (const tr of mix.tracks) {
      out[tr.id] = ms;
    }
    return out;
  }, [mix, playback?.duration]);

  useEffect(() => {
    if (!project?.id) {
      setSeparationInfo(null);
      return;
    }
    let cancelled = false;
    void api
      .loadSeparationInfo(project.id)
      .then((info) => {
        if (!cancelled) setSeparationInfo(info);
      })
      .catch(() => {
        if (!cancelled) setSeparationInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.activeSeparationId, mix?.id]);

  useEffect(() => {
    if (!project) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api.saveProjectForm(project.id, form).catch((e) => setError(String(e)));
    }, 5000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [form, project, setError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!project) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        void api.saveProjectForm(project.id, form).catch((err) => setError(String(err)));
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (!canGenerate) {
          setShowFormErrors(true);
          setWorkspace("create");
          setAdvancedSettingsPage(null);
          return;
        }
        void onGenerate();
      }
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        setMixPreview(null);
        void api.undoMix(project.id).then((m) => m && setMix(m));
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setMixPreview(null);
        void api.redoMix(project.id).then((m) => m && setMix(m));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!project) return null;

  async function onGenerateLocal() {
    if (!project) return;
    await api.startGeneration(project.id, form, scoreGate.abc);
    await openProject(project.id);
  }

  async function runGenerateAfterConsent() {
    if (!project) return;
    setRegenGateOpen(false);
    setRegenAfterDocument(null);
    setBusy(true);
    setError(null);
    try {
      const prefs = loadRemotePrefs();
      if (prefs.remoteEnabled) {
        const authToken = prefs.accessToken;
        const payload = await buildGenerationPayload(
          project.id,
          form,
          scoreGate.abc,
          authToken,
        );
        setRemotePrefs(prefs);
        setRemotePayload(payload);
        setRemoteConfirmOpen(true);
        return;
      }
      await onGenerateLocal();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    if (!project) return;
    if (formError || scoreGate.error) {
      setShowFormErrors(true);
      setWorkspace("create");
      setAdvancedSettingsPage(null);
      return;
    }
    const isRegen =
      Boolean(project.activeGenerationId) || generations.length > 0;
    // Conservation gate before regenerating from a reference score (§11.3 / #38).
    if (scoreDocument && isRegen) {
      setRegenBaselineDoc(scoreDocument);
      setRegenAfterDocument(null);
      setRegenGateOpen(true);
      return;
    }
    await runGenerateAfterConsent();
  }


  async function onConfirmRemoteGenerate() {
    if (!project || !remotePrefs || !remotePayload) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await runRemoteGenerationToProject(
        project.id,
        remotePrefs,
        remotePayload,
        {
          onStatus: (h) => {
            setError(`Worker distant: ${h.status} (${h.id})`);
          },
        },
      );
      setRemoteConfirmOpen(false);
      if (outcome.ok) {
        setError(null);
        await openProject(project.id);
      } else {
        setError(
          `${outcome.status}: ${outcome.error} — génération locale non démarrée.`,
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onContinue(generationId: string) {
    if (!project || !continuationLyrics.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const continuationForm: FormInput = {
        ...form,
        lyrics: continuationLyrics.trim(),
        continuationGenerationId: generationId,
      };
      const parentScore = await api.readScoreAbc(project.id, generationId);
      await api.startGeneration(project.id, continuationForm, scoreGate.abc ?? parentScore);
      setContinuationLyrics("");
      await openProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSeparate() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.startSeparation(project.id);
      setMix(m);
      await openProject(project.id);
      const info = await api.loadSeparationInfo(project.id);
      setSeparationInfo(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateBatch(count: number) {
    if (!project || formError || scoreGate.error) {
      setShowFormErrors(true);
      setWorkspace("create");
      setAdvancedSettingsPage(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < count; i++) {
        // Each call gets its own seed when form.seed is empty (backend CSPRNG).
        // If the user set a seed, only the first uses it; later ones randomize.
        const formForCall: FormInput =
          i === 0 || form.seed == null
            ? form
            : { ...form, seed: null };
        await api.startGeneration(project.id, formForCall, scoreGate.abc);
      }
      await openProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateScoreOnly() {
    if (!project || !canGenerateScoreOnly) {
      setShowFormErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await generateScoreOnly(project.id, form);
      await openProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRenderFromScore(sourceGenId: string, count: number) {
    if (!project || formError) {
      setShowFormErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renderNFromScore(project.id, sourceGenId, form, count);
      await openProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function scheduleMixUpdate(next: MixDoc | null) {
    if (!project || !next) return;
    setMixPreview(null);
    setMix(next);
    if (mixTimer.current) window.clearTimeout(mixTimer.current);
    mixTimer.current = window.setTimeout(() => {
      void api
        .updateMix(project.id, {
          masterGainDb: next.masterGainDb,
          tracks: next.tracks.map((tr: MixTrack) => ({
            id: tr.id,
            gainDb: tr.gainDb,
            pan: tr.pan,
            mute: tr.mute,
            solo: tr.solo,
            clips: tr.clips,
          })),
        })
        .then((m) => setMix(m))
        .catch((e) => setError(String(e)));
    }, 200);
  }

  const listeningMix = mixPreview ?? mix;
  const showMixAssist =
    !!mix &&
    mix.tracks.length > 0 &&
    playbackSources?.mode === "stems" &&
    (playbackSources.stems?.length ?? 0) > 0;

  return (
    <div className="song-layout">
      <header className="song-workspace-chrome">
        <div className="song-workspace-chrome-top">
          <div className="song-workspace-project">
            <h1>{project.title || t("form.createTitle")}</h1>
            {job && job.state !== "idle" && (
              <p className="song-job-banner" role="status" aria-live="polite">
                {job.label || t("job.generating")}
              </p>
            )}
          </div>
          <nav
            className="song-workspace-tabs"
            role="tablist"
            aria-label={t("workspace.nav")}
          >
            {WORKSPACES.map((space) => (
              <button
                key={space}
                type="button"
                role="tab"
                id={`song-tab-${space}`}
                className="song-workspace-tab"
                aria-selected={workspace === space}
                aria-controls={`song-panel-${space}`}
                tabIndex={workspace === space ? 0 : -1}
                onClick={() => selectWorkspace(space)}
              >
                {workspaceLabel(space)}
              </button>
            ))}
          </nav>
        </div>
        <div className="song-workspace-transport">
          <AudioPlayer
            projectId={project.id}
            sources={playbackSources}
            mix={listeningMix}
            onError={setError}
            onPlaybackChange={setPlayback}
          />
        </div>
      </header>

      <div className="song-workspace-body">
        {workspace === "create" && (
          <section
            className="song-workspace-panel"
            role="tabpanel"
            id="song-panel-create"
            aria-labelledby="song-tab-create"
          >
            <div className="song-form">
              <header className="song-form-heading song-workspace-heading">
                {advancedSettingsPage !== null && (
                  <button
                    type="button"
                    className="btn ghost form-page-back"
                    onClick={() =>
                      setAdvancedSettingsPage(
                        advancedSettingsPage === "index" ? null : "index",
                      )
                    }
                  >
                    {advancedSettingsPage === "index"
                      ? t("form.backToSong")
                      : t("form.backToAdvanced")}
                  </button>
                )}
                <h2>
                  {advancedSettingsPage === null
                    ? workspaceTitle("create")
                    : advancedSettingsTitle(advancedSettingsPage)}
                </h2>
                <p className="hint">
                  {advancedSettingsPage === null
                    ? workspaceIntro("create")
                    : advancedSettingsIntro(advancedSettingsPage)}
                </p>
              </header>

              {advancedSettingsPage === null && (
                <div className="song-primary-settings">
                  <label className="form-field">
                    {t("form.title")}
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ title: e.target.value })}
                      maxLength={120}
                      aria-invalid={
                        showFormErrors && Boolean(formFieldErrors.title)
                      }
                    />
                    {showFormErrors && formFieldErrors.title && (
                      <span className="hint error" role="alert">
                        {formFieldErrors.title}
                      </span>
                    )}
                  </label>
                  <label className="form-field">
                    {t("form.style")}
                    <textarea
                      value={form.style}
                      onChange={(e) => setForm({ style: e.target.value })}
                      rows={3}
                      aria-invalid={
                        showFormErrors && Boolean(formFieldErrors.style)
                      }
                    />
                    <span className="counter">{form.style.length}/1000</span>
                    <span className="hint">{t("form.style.hint")}</span>
                    {showFormErrors && formFieldErrors.style && (
                      <span className="hint error" role="alert">
                        {formFieldErrors.style}
                      </span>
                    )}
                  </label>
                  <label className="form-field">
                    {t("form.lyrics")}
                    <textarea
                      value={form.lyrics}
                      onChange={(e) => setForm({ lyrics: e.target.value })}
                      rows={10}
                      aria-invalid={
                        showFormErrors && Boolean(formFieldErrors.lyrics)
                      }
                    />
                    <span className="counter">{form.lyrics.length}/4000</span>
                    <span className="hint">{t("form.lyrics.tags")}</span>
                    {showFormErrors && formFieldErrors.lyrics && (
                      <span className="hint error" role="alert">
                        {formFieldErrors.lyrics}
                      </span>
                    )}
                  </label>

                  <div className="song-actions song-actions-sticky">
                    <div className="btn-row song-actions-primary">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy || Boolean(scoreGate.error)}
                        onClick={() => void onGenerate()}
                      >
                        {t("generate.button")}
                      </button>
                    </div>
                    {scoreGate.error && (
                      <p className="hint error">{scoreGate.error}</p>
                    )}
                    {scoreDocument && !scoreGate.error && (
                      <p className="hint ok">{t("score.willSendAbc")}</p>
                    )}
                    {!scoreDocument && (
                      <p className="hint">{t("score.phase1Path")}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="form-advanced-entry"
                    onClick={() => setAdvancedSettingsPage("index")}
                  >
                    <span className="form-advanced-entry-title">
                      {t("form.advanced")}
                    </span>
                    <span className="hint">{t("form.advanced.cardHint")}</span>
                    <span className="form-advanced-summary">{advancedSummary}</span>
                    <span className="form-advanced-entry-action">
                      {t("settings.openPage")}
                    </span>
                  </button>
                </div>
              )}

              {advancedSettingsPage === "index" && (
                <nav
                  className="form-parameter-grid"
                  aria-label={t("form.advanced")}
                >
                  <FormParameterCard
                    title={t("form.parameter.sound.title")}
                    description={t("form.parameter.sound.cardHint")}
                    value={soundSummaryValue(form)}
                    onClick={() => setAdvancedSettingsPage("sound")}
                  />
                  <FormParameterCard
                    title={t("form.plan")}
                    description={t("form.parameter.plan.cardHint")}
                    value={t(
                      form.cot === "off"
                        ? "form.plan.off"
                        : form.cot === "melody"
                          ? "form.plan.melody"
                          : "form.plan.full",
                    )}
                    onClick={() => setAdvancedSettingsPage("plan")}
                  />
                  <FormParameterCard
                    title={t("form.key")}
                    description={t("form.parameter.key.cardHint")}
                    value={
                      form.key
                        ? `${TONIC_LABELS[form.key.tonic] ?? form.key.tonic} · ${t(form.key.mode === "minor" ? "form.key.minor" : "form.key.major")}`
                        : t("form.automatic")
                    }
                    onClick={() => setAdvancedSettingsPage("key")}
                  />
                  <FormParameterCard
                    title={t("form.meter")}
                    description={t("form.parameter.meter.cardHint")}
                    value={
                      form.meter
                        ? `${form.meter.numerator}/${form.meter.denominator}`
                        : t("form.automatic")
                    }
                    onClick={() => setAdvancedSettingsPage("meter")}
                  />
                  <FormParameterCard
                    title={t("form.seed")}
                    description={t("form.parameter.seed.cardHint")}
                    value={
                      form.seed == null
                        ? t("form.automatic")
                        : String(form.seed)
                    }
                    onClick={() => setAdvancedSettingsPage("seed")}
                  />
                </nav>
              )}

              {advancedSettingsPage === "sound" && (
                <section className="form-parameter-page">
                  <fieldset className="form-section">
                    <legend>{t("form.section.sound")}</legend>
                    <div className="form-grid">
                      <label className="form-field">
                        {t("form.language")}
                        <input
                          placeholder={t("form.language.placeholder")}
                          value={form.singingLanguage ?? ""}
                          onChange={(e) =>
                            setForm({ singingLanguage: e.target.value || null })
                          }
                          maxLength={40}
                        />
                        <span className="hint">{t("form.language.hint")}</span>
                      </label>
                      <label className="form-field">
                        {t("form.tempo")}
                        <input
                          type="number"
                          min={40}
                          max={220}
                          placeholder={t("form.tempo.placeholder")}
                          value={form.tempoBpm ?? ""}
                          onChange={(e) =>
                            setForm({
                              tempoBpm: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <span className="hint">{t("form.tempo.hint")}</span>
                    <div className="duration-control">
                      <div className="duration-heading">
                        <label htmlFor="target-duration">{t("form.duration")}</label>
                        <output
                          htmlFor="target-duration"
                          className="duration-value"
                        >
                          {formatDurationLabel(form.targetDurationSec)}
                        </output>
                      </div>
                      <input
                        id="target-duration"
                        type="range"
                        className="duration-slider"
                        min={DURATION_SEC_MIN}
                        max={DURATION_SEC_MAX}
                        step={DURATION_SEC_STEP}
                        value={form.targetDurationSec}
                        onChange={(e) =>
                          setForm({
                            targetDurationSec: snapDurationSec(
                              Number(e.target.value),
                            ),
                          })
                        }
                        aria-invalid={
                          showFormErrors && Boolean(formFieldErrors.duration)
                        }
                      />
                      <div className="duration-range" aria-hidden="true">
                        <span>{formatDurationLabel(DURATION_SEC_MIN)}</span>
                        <span>{formatDurationLabel(DURATION_SEC_MAX)}</span>
                      </div>
                      {showFormErrors && formFieldErrors.duration && (
                        <p className="hint error" role="alert">
                          {formFieldErrors.duration}
                        </p>
                      )}
                      <p className="hint">
                        {t(
                          form.preferFullLyrics
                            ? "form.duration.hint"
                            : "form.duration.strictActiveHint",
                        )}
                      </p>
                      <fieldset className="duration-policy">
                        <legend className="sr-only">
                          {t("form.duration.policy")}
                        </legend>
                        <label className="duration-choice">
                          <input
                            type="radio"
                            name="duration-policy"
                            checked={form.preferFullLyrics}
                            onChange={() => setForm({ preferFullLyrics: true })}
                          />
                          <span>
                            <strong>{t("form.duration.preferLyrics")}</strong>
                            <small>{t("form.duration.preferLyricsHint")}</small>
                          </span>
                        </label>
                        <label className="duration-choice">
                          <input
                            type="radio"
                            name="duration-policy"
                            checked={!form.preferFullLyrics}
                            onChange={() =>
                              setForm({ preferFullLyrics: false })
                            }
                          />
                          <span>
                            <strong>{t("form.duration.strict")}</strong>
                            <small>{t("form.duration.strictHint")}</small>
                          </span>
                        </label>
                      </fieldset>
                    </div>
                  </fieldset>
                </section>
              )}

              {advancedSettingsPage === "plan" && (
                <section className="form-parameter-page">
                  <p className="hint">
                    {t(
                      form.cot === "off"
                        ? "form.plan.offHint"
                        : form.cot === "melody"
                          ? "form.plan.melodyHint"
                          : "form.plan.fullHint",
                    )}
                  </p>
                  <label className="form-field">
                    {t("form.plan")}
                    <select
                      value={form.cot}
                      onChange={(e) => setForm({ cot: e.target.value })}
                    >
                      <option value="full">{t("form.plan.full")}</option>
                      <option value="melody">{t("form.plan.melody")}</option>
                      <option value="off">{t("form.plan.off")}</option>
                    </select>
                  </label>
                </section>
              )}

              {advancedSettingsPage === "key" && (
                <section className="form-parameter-page">
                  <label className="form-field">
                    {t("form.key")}
                    <div className="row">
                      <select
                        value={form.key?.tonic ?? ""}
                        onChange={(e) => {
                          const tonic = e.target.value;
                          if (!tonic) setForm({ key: null });
                          else
                            setForm({
                              key: {
                                tonic,
                                mode: form.key?.mode ?? "major",
                              },
                            });
                        }}
                      >
                        <option value="">{t("form.automatic")}</option>
                        {TONICS.map((tonic) => (
                          <option key={tonic} value={tonic}>
                            {TONIC_LABELS[tonic]}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t("form.key.mode")}
                        value={form.key?.mode ?? "major"}
                        disabled={!form.key}
                        onChange={(e) =>
                          form.key &&
                          setForm({
                            key: { ...form.key, mode: e.target.value },
                          })
                        }
                      >
                        <option value="major">{t("form.key.major")}</option>
                        <option value="minor">{t("form.key.minor")}</option>
                      </select>
                    </div>
                  </label>
                </section>
              )}

              {advancedSettingsPage === "meter" && (
                <section className="form-parameter-page">
                  <label className="form-field">
                    {t("form.meter")}
                    <select
                      value={
                        form.meter
                          ? `${form.meter.numerator}/${form.meter.denominator}`
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) setForm({ meter: null });
                        else {
                          const [n, d] = v.split("/").map(Number);
                          setForm({
                            meter: { numerator: n, denominator: d },
                          });
                        }
                      }}
                    >
                      {METERS.map((m) => (
                        <option key={m || "none"} value={m}>
                          {m || t("form.automatic")}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              )}

              {advancedSettingsPage === "seed" && (
                <section className="form-parameter-page">
                  <label className="form-field">
                    {t("form.seed")}
                    <input
                      type="number"
                      min={0}
                      max={4294967295}
                      placeholder={t("form.seed.placeholder")}
                      value={form.seed ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          setForm({ seed: null });
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n) || n < 0) {
                          setForm({ seed: null });
                          return;
                        }
                        setForm({
                          seed: Math.min(Math.trunc(n), 4294967295),
                        });
                      }}
                    />
                  </label>
                </section>
              )}

              {advancedSettingsPage !== null && (
                <div className="song-actions">
                  <div className="btn-row song-actions-primary">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || Boolean(scoreGate.error)}
                      onClick={() => void onGenerate()}
                    >
                      {t("generate.button")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {workspace === "score" && (
          <section
            className="song-workspace-panel wide"
            role="tabpanel"
            id="song-panel-score"
            aria-labelledby="song-tab-score"
          >
            <header className="song-workspace-heading">
              <h2>{workspaceTitle("score")}</h2>
              <p className="hint">{workspaceIntro("score")}</p>
            </header>

            <nav
              className="song-subnav"
              role="tablist"
              aria-label={t("workspace.score.mode.nav")}
            >
              {SCORE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  className="song-subnav-tab"
                  aria-selected={scoreMode === mode}
                  id={`score-mode-${mode}`}
                  aria-controls={`score-mode-panel-${mode}`}
                  tabIndex={scoreMode === mode ? 0 : -1}
                  onClick={() => setScoreMode(mode)}
                >
                  {scoreModeLabel(mode)}
                </button>
              ))}
            </nav>

            <div
              id="score-mode-panel-edit"
              role="tabpanel"
              aria-labelledby="score-mode-edit"
              hidden={scoreMode !== "edit"}
            >
              <div className="score-edit-section">
                <ScorePanel
                  projectId={project.id}
                  document={scoreDocument}
                  cot={form.cot}
                  title={form.title}
                  onDocumentChange={setScoreDocument}
                  onProjectRefresh={() => openProject(project.id)}
                  onError={setError}
                  onCotChange={(cot) => setForm({ cot })}
                  defaultOpen
                  playbackSeconds={playback?.current ?? 0}
                  playbackReady={Boolean(playback?.ready)}
                  onSeekPlayback={playback?.seek}
                />
              </div>

              {!scoreDocument && (
                <div className="score-reprise-nudge">
                  <p className="hint">{t("workspace.score.repriseHint")}</p>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setScoreMode("reprise")}
                  >
                    {t("workspace.score.openReprise")}
                  </button>
                </div>
              )}

              {scoreDocument && (
                <div
                  className="song-actions"
                  aria-label={t("workspace.score.primary")}
                >
                  <ScoreOnlyGenerate
                    canGenerate={canGenerateScoreOnly}
                    busy={busy}
                    onGenerateScoreOnly={onGenerateScoreOnly}
                  />
                  <MultiRenderFromScore
                    generations={generations}
                    busy={busy}
                    renderCount={renderFromScoreCount}
                    onRenderCountChange={setRenderFromScoreCount}
                    onRenderFromScore={onRenderFromScore}
                  />
                </div>
              )}

              <details
                open={scoreOpen}
                onToggle={(e) =>
                  setScoreOpen((e.target as HTMLDetailsElement).open)
                }
              >
                <summary>{t("score.toggle")}</summary>
                <pre className="score">{scoreAbc ?? t("score.empty")}</pre>
              </details>
            </div>

            <div
              id="score-mode-panel-reprise"
              role="tabpanel"
              aria-labelledby="score-mode-reprise"
              hidden={scoreMode !== "reprise"}
              className="sheetsage-section"
            >
              <SheetSage2Panel
                projectId={project.id}
                form={form}
                mix={mix}
                busy={busy}
                hideTitle
                playbackSeconds={playback?.current ?? 0}
                playbackReady={Boolean(playback?.ready)}
                onSeekPlayback={playback?.seek}
                onConfirmGenerate={async (confirmedAbc, cot) => {
                  setBusy(true);
                  setError(null);
                  try {
                    const formForCall: FormInput = { ...form, cot };
                    await api.startGeneration(
                      project.id,
                      formForCall,
                      confirmedAbc,
                      {
                        sourceGenerationId: project.activeGenerationId ?? null,
                      },
                    );
                    await openProject(project.id);
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </section>
        )}

        {workspace === "production" && (
          <section
            className="song-workspace-panel wide"
            role="tabpanel"
            id="song-panel-production"
            aria-labelledby="song-tab-production"
          >
            <header className="song-workspace-heading">
              <h2>{workspaceTitle("production")}</h2>
              <p className="hint">{workspaceIntro("production")}</p>
            </header>

            <nav
              className="song-subnav"
              role="tablist"
              aria-label={t("workspace.production.nav")}
            >
              {PRODUCTION_VIEWS.map((view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  className="song-subnav-tab"
                  aria-selected={productionView === view}
                  id={`production-view-${view}`}
                  aria-controls={`production-panel-${view}`}
                  tabIndex={productionView === view ? 0 : -1}
                  onClick={() => setProductionView(view)}
                >
                  {productionViewLabel(view)}
                </button>
              ))}
            </nav>

            <p className="hint song-subview-intro">
              {productionViewIntro(productionView)}
            </p>

            <div className="production-global-actions">
              <div className="song-actions">
                <div className="btn-row song-actions-primary">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!project.activeGenerationId || busy}
                    onClick={() => void onSeparate()}
                  >
                    {t("separate.button")}
                  </button>
                </div>
                <div
                  className="btn-row song-actions-export"
                  role="group"
                  aria-label={t("export.group")}
                >
                  <span className="song-actions-label">{t("export.group")}</span>
                  <button
                    type="button"
                    className="btn"
                    disabled={!project.activeGenerationId || busy}
                    onClick={() => void onExport("wav")}
                  >
                    {t("export.wav")}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!project.activeGenerationId || busy}
                    onClick={() => void onExport("flac")}
                  >
                    {t("export.flac")}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!project.activeGenerationId || busy}
                    onClick={() => void onExport("mp3")}
                  >
                    {t("export.mp3")}
                  </button>
                </div>
              </div>

              <div className="mix-user-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || importingAudio}
                  onClick={() => void onImportUserAudio()}
                >
                  {importingAudio ? t("mix.importing") : t("mix.importAudio")}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setRecordOpen((v) => !v)}
                  aria-expanded={recordOpen}
                >
                  {t("mix.recordAudio")}
                </button>
                <p className="hint">{t("mix.importHint")}</p>
              </div>

              <RecordTrackPanel
                projectId={project.id}
                open={recordOpen}
                onClose={() => setRecordOpen(false)}
                onTrackAdded={(m) => void onUserTrackAdded(m)}
                onError={setError}
              />
            </div>

            <div
              id="production-panel-mix"
              role="tabpanel"
              aria-labelledby="production-view-mix"
              hidden={productionView !== "mix"}
            >
              {mix ? (
                <div className="mixer">
                  {separationInfo && separationInfo.warnings.length > 0 && (
                    <aside
                      className="banner warn separation-warn"
                      role="status"
                      aria-live="polite"
                    >
                      <div>
                        <strong>{t("separation.warn.title")}</strong>
                        <ul className="separation-warn-list">
                          {separationInfo.warnings.map((code) => (
                            <li key={code}>{warningLabel(code)}</li>
                          ))}
                        </ul>
                      </div>
                    </aside>
                  )}
                  {showMixAssist && (
                    <MixAssistPanel
                      mix={mix}
                      sources={playbackSources}
                      listeningMix={listeningMix ?? mix}
                      onCommitMix={scheduleMixUpdate}
                      onPreviewMix={setMixPreview}
                    />
                  )}
                  <label className="master">
                    {t("mix.master")}
                    <input
                      type="range"
                      min={-24}
                      max={12}
                      step={0.5}
                      value={mix.masterGainDb}
                      onChange={(e) =>
                        scheduleMixUpdate({
                          ...mix,
                          masterGainDb: Number(e.target.value),
                        })
                      }
                    />
                    <span className="mix-value">
                      {formatGainDb(mix.masterGainDb)}
                    </span>
                  </label>
                  {mix.tracks.map((tr) => {
                    const anySolo = mix.tracks.some((x) => x.solo);
                    const muted = tr.mute || (anySolo && !tr.solo);
                    const peaks = playback?.peaksByTrack[tr.id] ?? null;
                    const waveStatus =
                      !playback || playback.loading || !playback.ready
                        ? "loading"
                        : peaks && peaks.length > 0
                          ? "ready"
                          : "empty";
                    return (
                      <div
                        key={tr.id}
                        className="track"
                        data-role={tr.role.toLowerCase()}
                      >
                        <strong className="track-name">{tr.name}</strong>
                        <button
                          type="button"
                          className={tr.mute ? "btn active" : "btn"}
                          onClick={() =>
                            scheduleMixUpdate({
                              ...mix,
                              tracks: mix.tracks.map((x) =>
                                x.id === tr.id ? { ...x, mute: !x.mute } : x,
                              ),
                            })
                          }
                        >
                          {t("mix.mute")}
                        </button>
                        <button
                          type="button"
                          className={tr.solo ? "btn active" : "btn"}
                          onClick={() =>
                            scheduleMixUpdate({
                              ...mix,
                              tracks: mix.tracks.map((x) =>
                                x.id === tr.id ? { ...x, solo: !x.solo } : x,
                              ),
                            })
                          }
                        >
                          {t("mix.solo")}
                        </button>
                        <div className="track-wave">
                          <Waveform
                            peaks={peaks}
                            progress={playback?.current ?? 0}
                            duration={playback?.duration ?? 0}
                            height={40}
                            muted={muted}
                            status={waveStatus}
                            role={tr.role}
                            ariaLabel={tr.name}
                            onSeek={playback?.seek}
                          />
                        </div>
                        <label className="track-gain">
                          <span className="track-fader-label">
                            <span>{t("mix.gain")}</span>
                            <span className="mix-value" aria-hidden>
                              {formatGainDb(tr.gainDb)}
                            </span>
                          </span>
                          <input
                            type="range"
                            min={-24}
                            max={12}
                            step={0.5}
                            value={tr.gainDb}
                            aria-label={t("mix.gainNamed", { track: tr.name })}
                            aria-valuetext={formatGainDb(tr.gainDb)}
                            onChange={(e) =>
                              scheduleMixUpdate({
                                ...mix,
                                tracks: mix.tracks.map((x) =>
                                  x.id === tr.id
                                    ? { ...x, gainDb: Number(e.target.value) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="track-pan">
                          <span className="track-fader-label">
                            <span>{t("mix.pan")}</span>
                            <span className="mix-value" aria-hidden>
                              {formatPan(tr.pan)}
                            </span>
                          </span>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.01}
                            value={tr.pan}
                            aria-label={t("mix.panNamed", { track: tr.name })}
                            aria-valuetext={formatPan(tr.pan)}
                            onChange={(e) =>
                              scheduleMixUpdate({
                                ...mix,
                                tracks: mix.tracks.map((x) =>
                                  x.id === tr.id
                                    ? { ...x, pan: Number(e.target.value) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void api
                        .saveMixVersion(project.id)
                        .then((m) => setMix(m))
                        .catch((e) => setError(String(e)))
                    }
                  >
                    {t("mix.saveVersion")}
                  </button>
                </div>
              ) : (
                <p className="hint">{t("mix.needSeparation")}</p>
              )}
            </div>

            <div
              id="production-panel-clips"
              role="tabpanel"
              aria-labelledby="production-view-clips"
              hidden={productionView !== "clips"}
            >
              {mix ? (
                <div className="production-clips">
                  <ClipTimeline
                    mix={mix}
                    onChange={scheduleMixUpdate}
                    peaksByTrack={playback?.peaksByTrack}
                    roleByTrack={roleByTrack}
                    sourceDurationMsByTrack={sourceDurationMsByTrack}
                  />
                </div>
              ) : (
                <p className="hint">{t("mix.needSeparation")}</p>
              )}
            </div>

            <div
              id="production-panel-tools"
              role="tabpanel"
              aria-labelledby="production-view-tools"
              hidden={productionView !== "tools"}
              className="advanced-production"
            >
              <Phase3MixPanel mix={mix} sources={playbackSources} />
            </div>
          </section>
        )}

        {workspace === "versions" && (
          <section
            className="song-workspace-panel wide"
            role="tabpanel"
            id="song-panel-versions"
            aria-labelledby="song-tab-versions"
          >
            <header className="song-workspace-heading">
              <h2>{workspaceTitle("versions")}</h2>
              <p className="hint">{workspaceIntro("versions")}</p>
            </header>

            <CandidateCompare
              generations={generations}
              activeId={project.activeGenerationId}
              busy={busy}
              candidateCount={candidateCount}
              onCandidateCount={setCandidateCount}
              onGenerateBatch={onGenerateBatch}
              onUse={(genId) => {
                void api
                  .useGeneration(project.id, genId)
                  .then(() => openProject(project.id));
              }}
            />

            {generations.find((g) => g.id === project.activeGenerationId)
              ?.semanticTruncated && (
              <section
                className="continuation-panel"
                aria-labelledby="continue-title"
              >
                <h3 id="continue-title">{t("generations.lyricsTruncated")}</h3>
                <p className="hint">{t("generations.continueHint")}</p>
                <label>
                  {t("generations.remainingLyrics")}
                  <textarea
                    rows={5}
                    value={continuationLyrics}
                    onChange={(e) => setContinuationLyrics(e.target.value)}
                    placeholder={t("generations.remainingLyricsPlaceholder")}
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={
                    busy ||
                    !continuationLyrics.trim() ||
                    !generations.find(
                      (g) => g.id === project.activeGenerationId,
                    )?.canContinue
                  }
                  onClick={() => {
                    const active = generations.find(
                      (g) => g.id === project.activeGenerationId,
                    );
                    if (active) void onContinue(active.id);
                  }}
                >
                  {t("generations.continue")}
                </button>
              </section>
            )}

            <div className="version-history">
              <h3>
                {t("versions.history", {
                  count: String(generations.length),
                })}
              </h3>
              <p className="hint">{t("versions.hint")}</p>
              <VersionGraph
                generations={generations}
                activeId={project.activeGenerationId}
                onUse={(genId) => {
                  void api
                    .useGeneration(project.id, genId)
                    .then(() => openProject(project.id));
                }}
              />
            </div>
          </section>
        )}
      </div>

      {remotePrefs && (
        <RemoteGenerateConfirm
          open={remoteConfirmOpen}
          prefs={remotePrefs}
          payloadPreview={remotePayload}
          busy={busy}
          onCancel={() => setRemoteConfirmOpen(false)}
          onConfirm={onConfirmRemoteGenerate}
        />
      )}

      {project && (
        <RegenerationGate
          open={regenGateOpen}
          projectId={project.id}
          beforeDocument={regenBaselineDoc ?? scoreDocument}
          afterDocument={regenAfterDocument}
          isRegeneration={
            Boolean(project.activeGenerationId) || generations.length > 0
          }
          onProceed={() => {
            void runGenerateAfterConsent();
          }}
          onCancel={() => {
            setRegenGateOpen(false);
            setRegenAfterDocument(null);
            setRegenBaselineDoc(null);
          }}
          onConfirmKeep={() => {
            setRegenGateOpen(false);
            setRegenAfterDocument(null);
            setRegenBaselineDoc(null);
          }}
          onRevert={(baselineScoreId) => {
            void (async () => {
              if (!baselineScoreId) {
                setRegenGateOpen(false);
                return;
              }
              try {
                const doc = await api.loadScoreVersion(
                  project.id,
                  baselineScoreId,
                );
                if (doc) {
                  setScoreDocument(doc as ScoreDocument);
                  await api.setActiveScore(project.id, baselineScoreId);
                  await openProject(project.id);
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setRegenGateOpen(false);
                setRegenAfterDocument(null);
                setRegenBaselineDoc(null);
              }
            })();
          }}
        />
      )}
    </div>
  );
}


function FormParameterCard({
  title,
  description,
  value,
  onClick,
}: {
  title: string;
  description: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="form-parameter-card" onClick={onClick}>
      <strong>{title}</strong>
      <span className="form-parameter-description">{description}</span>
      <span className="form-parameter-value">{value}</span>
      <span className="form-parameter-open">{t("settings.openPage")}</span>
    </button>
  );
}
