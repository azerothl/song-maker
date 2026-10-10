import { api } from "../lib/api";
import { generationErrorMessage } from "../lib/generationError";
import { TakePreviewPlayer } from "../components/TakePreviewPlayer";
import { BatchGenerationPanel } from "../components/BatchGenerationPanel";
import { buildGenerationPayload, loadRemotePrefs, runRemoteGenerationToProject } from "../lib/remoteGenerate";
import { CreateWorkspace } from "./song/CreateWorkspace";
import { matchesGenerateShortcut } from "./song/createWorkspaceLayout";
import { ensureProductionOverlay, normalizeProductionOverlay, setProductionDiskPersist, setProductionOverlay, setProductionProjectScope, setProductionTempoBpm, undoProductionOverlay, redoProductionOverlay } from "../lib/productionState";
import { exportProjectAudio } from "../lib/exportMix";
import { generateInstrumentalComparisonTake, generateInstrumentalTake, generateScoreOnly, renderNFromScore } from "../lib/scoreOnlyApi";
import { createEmptyScoreDocument, importAbcText, importMidiBytes, prepareAbcForGeneration, type ScoreDocument } from "../lib/score";
import { midiBytesToUint8Array } from "../lib/basicPitchProduct";
import {
  DEFAULT_PRODUCTION_CLIP_VIEW_PREFS,
  type ProductionClipViewPrefs,
} from "../lib/productionClipViewPrefs";
import { loadInvariantBaseline } from "../lib/invariants";
import { planProjectInstrumentalPart } from "../lib/projectInstrumental";
import { isTauriRuntime, runtimeApi } from "../lib/runtimeHost";
import { ProductionWorkspace } from "./song/ProductionWorkspace";
import { ProfileKindBadge } from "../components/ProfileKindBadge";
import { RegenerationGate } from "../components/RegenerationGate";
import { RemoteGenerateConfirm } from "../components/RemoteGenerateConfirm";
import { SeparationAgainConfirmDialog } from "../components/SeparationAgainConfirmDialog";
import { ScoreWorkspace } from "./song/ScoreWorkspace";
import { StudioMidiTrackEditor } from "../components/StudioMidiTrackEditor";
import { t } from "../ui/i18n";
import { useAppStore } from "../store/appStore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { VersionsWorkspace } from "./song/VersionsWorkspace";
import type { BuiltRemotePayload, RemoteWorkerPreferences } from "@song-maker/remote-worker";
import { LORA_PACK_CATALOG } from "@song-maker/lora-packs";
import type { FormInput, MixDoc, MixTrack, SeparationInfo } from "../lib/types";
import { packLibraryState } from "../lib/loraLibrary";
import {
  advancedSettingsSummary,
  primaryFormError,
  validateFormFields,
  workspaceLabel,
  WORKSPACES,
  type AdvancedSettingsPage,
  type ScoreMode,
  type SongWorkspace,
} from "./song/shared";

export function SongScreen({ initialWorkspace = "create" }: { initialWorkspace?: SongWorkspace }) {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const project = useAppStore((s) => s.project);
  const form = useAppStore((s) => s.form);
  const settings = useAppStore((s) => s.settings);
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
  const playback = useAppStore((s) => s.playback);
  const setError = useAppStore((s) => s.setError);
  const openProject = useAppStore((s) => s.openProject);
  const refreshJob = useAppStore((s) => s.refreshJob);
  const job = useAppStore((s) => s.job);
  const setProfileOperationBusy = useAppStore((s) => s.setProfileOperationBusy);
  const openLoraSettings = useAppStore((s) => s.openLoraSettings);
  const openSeparationSettings = useAppStore((s) => s.openSeparationSettings);

  const [pendingPart, setPendingPart] = useState<{ projectId: string; generationId: string; audioPath: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelRequestPending, setCancelRequestPending] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [legoSidecarReady, setLegoSidecarReady] = useState(false);
  const [legoLicenseAccepted, setLegoLicenseAccepted] = useState(false);
  const [instrumentalPackState, setInstrumentalPackState] =
    useState<"active" | "installed" | "missing" | "unknown">("unknown");
  useEffect(() => {
    let cancelled = false;
    const instrumentalPack = LORA_PACK_CATALOG.find(
      (pack) => pack.id === "mothersuperior-instrumental-ar",
    );
    if (
      !settings ||
      settings.generationEngine !== "yue2" ||
      !isTauriRuntime() ||
      !instrumentalPack
    ) {
      setInstrumentalPackState("unknown");
      return;
    }
    void api
      .listLoraAdapters()
      .then((adapters) => {
        if (cancelled) return;
        const state = packLibraryState(instrumentalPack, adapters, settings);
        setInstrumentalPackState(
          state.active ? "active" : state.installed ? "installed" : "missing",
        );
      })
      .catch(() => {
        if (!cancelled) setInstrumentalPackState("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [settings]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    void runtimeApi
      .aceStepLegoStatus()
      .then((st) => {
        if (cancelled) return;
        setLegoSidecarReady(Boolean(st.ready || st.inferenceAvailable));
        setLegoLicenseAccepted(Boolean(st.licenseAccepted));
      })
      .catch(() => {
        if (!cancelled) {
          setLegoSidecarReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, settings?.cacheDir, settings?.aceStepLegoLicenseAccepted]);
  useEffect(() => {
    setProfileOperationBusy(busy);
    return () => setProfileOperationBusy(false);
  }, [busy, setProfileOperationBusy]);
  const [showFormErrors, setShowFormErrors] = useState(false);
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
  const [remoteProgress, setRemoteProgress] = useState<string | null>(null);
  const [advancedSettingsPage, setAdvancedSettingsPage] =
    useState<AdvancedSettingsPage>(null);
  const [workspace, setWorkspace] = useState<SongWorkspace>(initialWorkspace);
  const [midiEditorVoiceId, setMidiEditorVoiceId] = useState<string | null>(null);
  const [midiEditorTrackName, setMidiEditorTrackName] = useState<string | null>(null);
  const midiEditorCloseRef = useRef<HTMLButtonElement>(null);
  const midiEditorReturnFocusRef = useRef<HTMLElement | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [productionClipViewPrefs, setProductionClipViewPrefs] =
    useState<ProductionClipViewPrefs>(() => DEFAULT_PRODUCTION_CLIP_VIEW_PREFS);
  const patchProductionClipViewPrefs = (patch: Partial<ProductionClipViewPrefs>) => {
    setProductionClipViewPrefs((prev) => ({ ...prev, ...patch }));
  };
  const [scoreMode, setScoreMode] = useState<ScoreMode>("edit");
  const [separationInfo, setSeparationInfo] = useState<SeparationInfo | null>(
    null,
  );
  const [separationUndo, setSeparationUndo] = useState<{
    separationId: string;
    mixId: string;
  } | null>(null);
  const [separationAgainConfirmOpen, setSeparationAgainConfirmOpen] =
    useState(false);
  const [importingAudio, setImportingAudio] = useState(false);
  const [transcribingTrackId, setTranscribingTrackId] = useState<string | null>(
    null,
  );
  const [mixPreview, setMixPreview] = useState<MixDoc | null>(null);
  const [midiTrackMix, setMidiTrackMix] = useState<MixDoc | null>(null);
  const scoreMidiFallbackMix = useMemo(() => {
    if (!project || !scoreDocument) return null;
    const midiVoices = scoreDocument.voices.filter((voice) => voice.id.startsWith("midi-"));
    if (!midiVoices.length) return null;
    const base = midiTrackMix ?? mix ?? {
      schema: "songmaker.mix",
      schemaVersion: 1,
      id: project.activeMixId ?? `midi-${project.id}`,
      separationId: project.activeSeparationId ?? "",
      sampleRate: project.sampleRate,
      masterGainDb: 0,
      peakCeilingDb: -1,
      tracks: [],
      vst3MasterInsert: null,
      tempoMap: [],
      timeSignatures: [],
      markers: [],
    } satisfies MixDoc;
    const present = new Set(base.tracks.map((track) => track.id));
    const missingMidiTracks = midiVoices
      .filter((voice) => !present.has(voice.id))
      .map((voice) => ({
        id: voice.id,
        role: "midi",
        name: voice.name,
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: false,
        clips: [],
      }));
    return missingMidiTracks.length
      ? { ...base, tracks: [...base.tracks, ...missingMidiTracks] }
      : null;
  }, [mix, midiTrackMix, project, scoreDocument]);
  const displayedMix = scoreMidiFallbackMix ?? midiTrackMix ?? mix;
  const [mixSavedAt, setMixSavedAt] = useState<Date | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [regenGateOpen, setRegenGateOpen] = useState(false);
  const [regenAfterDocument, setRegenAfterDocument] =
    useState<ScoreDocument | null>(null);
  const [regenBaselineDoc, setRegenBaselineDoc] =
    useState<ScoreDocument | null>(null);
  const saveTimer = useRef<number | null>(null);
  const mixTimer = useRef<number | null>(null);
  const canCancelCurrentJob = Boolean(
    project &&
      job?.projectId === project.id &&
      ["preparing", "generating", "separating", "importing_tracks"].includes(job.state),
  );
  const projectJob = job?.projectId === project?.id ? job : null;

  useEffect(() => {
    if (!canCancelCurrentJob) {
      setCancelRequested(false);
      setCancelRequestPending(false);
      setCancelMessage(null);
    }
  }, [canCancelCurrentJob]);

  async function onCancelCurrentJob() {
    if (!canCancelCurrentJob || cancelRequestPending || cancelRequested) return;
    setCancelRequestPending(true);
    try {
      const requested = await api.cancelJob();
      setCancelRequested(requested);
      setCancelMessage(t(requested ? "cancel.message" : "cancel.none"));
      await refreshJob();
    } catch (e) {
      setError(String(e));
    } finally {
      setCancelRequestPending(false);
    }
  }

  async function onImportUserAudio() {
    if (!project || importingAudio) return;
    setImportingAudio(true);
    setError(null);
    try {
      const next = await api.importUserAudioTrack(project.id);
      if (next) {
        setMix(next);
        await openProject(project.id, { preserveForm: true });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImportingAudio(false);
    }
  }

  async function onAddMidiTrack() {
    if (!project || busy) return;
    setBusy(true);
    setError(null);
    try {
      midiEditorReturnFocusRef.current = document.activeElement as HTMLElement | null;
      const base = scoreDocument ?? createEmptyScoreDocument({
        tempoBpm: form.tempoBpm ?? 120,
        branchName: "main",
      });
      const voiceId = `midi-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      const name = `Instrument MIDI ${(mix?.tracks.filter((track) => track.role === "midi").length ?? 0) + 1}`;
      const score: ScoreDocument = {
        ...base,
        version: base.version + 1,
        voices: [
          ...(scoreDocument ? base.voices : []),
          { id: voiceId, name, role: "other", notes: [], abcVoice: "Ins" },
        ],
        source: "manual",
      };
      const saved = await api.saveScore(project.id, score);
      const savedScore = {
        ...score,
        id: saved.project.activeScoreId ?? saved.scoreId,
      };
      const nextMix = await api.addEmptyMidiTrack(project.id, voiceId, name);
      if (!nextMix || !Array.isArray(nextMix.tracks)) {
        throw new Error("Le mix du projet n’a pas été retourné après l’ajout de la piste.");
      }
      const persistedMix = await api.loadMix(project.id);
      const activeMix = persistedMix?.tracks.some((track) => track.id === voiceId)
        ? persistedMix
        : nextMix;
      setScoreDocument(savedScore);
      // The command response already contains the authoritative project mix.
      // Reopening the project here can race a first-time mix creation and
      // replace this result with a null mix.
      useAppStore.setState({ mix: activeMix });
      if (!useAppStore.getState().mix?.tracks.some((track) => track.id === voiceId)) {
        throw new Error("La piste MIDI n’a pas été ajoutée au mix actif.");
      }
      setWorkspace("production");
      setMidiEditorVoiceId(voiceId);
      setMidiEditorTrackName(name);
      setMidiTrackMix(activeMix);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function onUserTrackAdded(next: MixDoc) {
    setMix(next);
    if (project) await openProject(project.id, { preserveForm: true });
  }

  function onEditMidiTrack(trackId: string, trackName: string) {
    midiEditorReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setMidiEditorVoiceId(trackId);
    setMidiEditorTrackName(trackName);
  }

  async function onTranscribeBasicPitch(track: MixTrack) {
    if (!project || transcribingTrackId) return;
    setTranscribingTrackId(track.id);
    setBusy(true);
    setError(null);
    try {
      const result = await api.transcribeBasicpitch(project.id, track.id);
      const { document } = importMidiBytes(midiBytesToUint8Array(result.midiBytes), {
        id: `basicpitch-${track.id}`,
      });
      await api.saveScore(project.id, document);
      setScoreDocument(document);
      setScoreOpen(true);
      setWorkspace("score");
      await openProject(project.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setTranscribingTrackId(null);
    }
  }

  async function onRequestInstrumentalPart(input: {
    role: "bass" | "drums" | "other";
    conditioning: "project_metadata" | "mix_stems";
  }) {
    if (!project) return;
    const plan = planProjectInstrumentalPart({
      role: input.role,
      conditioning: input.conditioning,
      style: form.style,
      tempoBpm: form.tempoBpm,
      key: form.key ?? null,
      hasMixOrStems: Boolean(mix?.tracks.length),
      legoSidecarReady,
      legoLicenseAccepted,
    });
    if (!plan.ok) {
      setError(plan.messageFr);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextForm: FormInput = {
        ...form,
        style: plan.styleSent,
        lyrics: "",
        instrumentalMode: true,
      };
      const result = await api.generateInstrumentalPart(
        project.id,
        nextForm,
        plan.role,
        plan.conditioning === "mix_stems"
          ? "ace_step_lego"
          : undefined,
      );
      const genId = result.generationId;
      if (!genId) {
        throw new Error(
          "Génération sans identifiant actif — piste non ajoutée à l’arrangement.",
        );
      }
      if (plan.conditioning === "mix_stems") {
        const takes = await api.listGenerations(project.id);
        const audioPath = takes.find(take => take.id === genId)?.audioPath;
        if (!audioPath) throw new Error(t("production.instrumental.previewMissing"));
        await openProject(project.id, { preserveForm: true });
        setPendingPart({ projectId: project.id, generationId: genId, audioPath, name: plan.displayName });
        return;
      }
      const nextMix = await api.importGenerationAsUserTrack(
        project.id,
        genId,
        plan.displayName,
      );
      await onUserTrackAdded(nextMix);

    } catch (e) {
      setError(generationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptPendingPart(muteExisting: boolean) {
    if (!pendingPart || pendingPart.projectId !== project?.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextMix = await api.importGenerationAsUserTrack(project.id, pendingPart.generationId, pendingPart.name, muteExisting);
      setPendingPart(null);
      await onUserTrackAdded(nextMix);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
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
  const scoreOnlyDisabledReason = busy
    ? t("stopAfter.generateScoreOnlyBusy")
    : formError
      ? t("stopAfter.generateScoreOnlyFixFields")
      : form.cot === "off"
        ? t("stopAfter.generateScoreOnlyEnablePlan")
        : scoreGate.abc
          ? t("stopAfter.generateScoreOnlyAlreadyHasScore")
          : t("stopAfter.generateScoreOnlyUnavailable");

  useEffect(() => {
    setShowFormErrors(false);
    setRegenGateOpen(false);
    setRegenAfterDocument(null);
    setRegenBaselineDoc(null);
    setWorkspace(initialWorkspace);
    setAdvancedSettingsPage(null);
    setScoreMode("edit");
  }, [project?.id, initialWorkspace]);

  useEffect(() => {
    if (workspace === "create" && screen === "studio") setScreen("create");
    if (workspace !== "create" && screen === "create") setScreen("studio");
  }, [screen, setScreen, workspace]);

  useEffect(() => {
    if (!midiEditorVoiceId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => midiEditorCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMidiEditorVoiceId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".studio-midi-editor");
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      midiEditorReturnFocusRef.current?.focus();
      midiEditorReturnFocusRef.current = null;
    };
  }, [midiEditorVoiceId]);

  function selectWorkspace(next: SongWorkspace) {
    setWorkspace(next);
    if (next !== "create") setAdvancedSettingsPage(null);
  }

  useEffect(() => {
    if (!project?.id) return;
    loadInvariantBaseline(project.id);
  }, [project?.id]);

  useLayoutEffect(() => {
    setProductionProjectScope(project?.id ?? null);
    return () => setProductionProjectScope(null);
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) return;
    setProductionDiskPersist((mixId, overlay) => {
      void api.saveProductionOverlay(project.id, mixId, overlay).catch(() => {
        /* localStorage remains the offline fallback */
      });
    });
    return () => setProductionDiskPersist(null);
  }, [project?.id]);

  useEffect(() => {
    if (!mix?.id || !project?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const disk = await api.loadProductionOverlayDisk(project.id, mix.id);
        if (cancelled) return;
        if (disk) {
          setProductionOverlay(
            normalizeProductionOverlay(disk, mix.id),
            { recordUndo: false },
          );
          return;
        }
      } catch {
        /* fall through to localStorage */
      }
      if (!cancelled) ensureProductionOverlay(mix.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [mix?.id, project?.id]);

  useEffect(() => {
    setProductionTempoBpm(form.tempoBpm);
  }, [form.tempoBpm]);

  const roleByTrack = useMemo(() => {
    const out: Record<string, string> = {};
    if (!displayedMix) return out;
    for (const tr of displayedMix.tracks) {
      out[tr.id] = tr.role.toLowerCase();
    }
    return out;
  }, [displayedMix]);

  const sourceDurationMsByTrack = useMemo(() => {
    const out: Record<string, number> = {};
    if (!displayedMix || !playback?.duration || playback.duration <= 0) return out;
    const ms = Math.round(playback.duration * 1000);
    for (const tr of displayedMix.tracks) {
      out[tr.id] = ms;
    }
    return out;
  }, [displayedMix, playback?.duration]);

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
      if (matchesGenerateShortcut(e)) {
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
        const overlayRestored = undoProductionOverlay();
        void api.undoMix(project.id).then((m) => {
          if (m) setMix(m);
          else if (!overlayRestored) {
            /* nothing to undo */
          }
        });
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setMixPreview(null);
        redoProductionOverlay();
        void api.redoMix(project.id).then((m) => m && setMix(m));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!project) return null;

  async function onGenerateLocal() {
    if (!project) return;
    if (form.instrumentalMode && settings?.generationEngine !== "ace_step") {
      if (form.cot === "off") {
        throw new Error(t("form.instrumental.scoreRequired"));
      }
      await generateInstrumentalTake(project.id, form, scoreGate.abc);
    } else {
      await api.startGeneration(project.id, form, scoreGate.abc);
    }
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
        if (form.instrumentalMode && settings?.generationEngine !== "ace_step") {
          setRemoteProgress(t("generation.instrumentalLocal"));
          await onGenerateLocal();
          return;
        }
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
      setError(generationErrorMessage(e));
    } finally {
      setBusy(false);
      setRemoteProgress(null);
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
    setRemoteProgress(t("phase4.remote.progress"));
    setError(null);
    try {
      const outcome = await runRemoteGenerationToProject(
        project.id,
        remotePrefs,
        remotePayload,
        {
          onStatus: (handle) => {
            if (handle.status === "queued" || handle.status === "running") {
              setRemoteProgress(t("phase4.remote.progress"));
            } else if (handle.status === "succeeded") {
              setRemoteProgress(t("phase4.remote.importing"));
            }
          },
        },
      );
      setRemoteConfirmOpen(false);
      if (outcome.ok) {
        setRemoteProgress(null);
        setError(null);
        await openProject(project.id);
      } else {
        setRemoteProgress(null);
        setError(t("phase4.remote.notAdded", { reason: outcome.error }));
      }
    } catch (e) {
      setRemoteProgress(null);
      setError(generationErrorMessage(e));
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
      setError(generationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSeparation(isRepeat: boolean) {
    if (!project) return;
    const prevSep = project.activeSeparationId ?? null;
    const prevMix = project.activeMixId ?? null;
    setBusy(true);
    setError(null);
    try {
      const m = await api.startSeparation(project.id);
      setMix(m);
      await openProject(project.id);
      const info = await api.loadSeparationInfo(project.id);
      setSeparationInfo(info);
      if (isRepeat && prevSep && prevMix) {
        setSeparationUndo({ separationId: prevSep, mixId: prevMix });
      } else {
        setSeparationUndo(null);
      }
    } catch {
      setError(t("separate.run.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onSeparate() {
    if (!project) return;
    const hasAiStems = mix?.tracks.some((track) => track.aiSeparated) ?? false;
    if (hasAiStems) {
      setSeparationAgainConfirmOpen(true);
      return;
    }
    await runSeparation(false);
  }

  function confirmSeparationAgain() {
    setSeparationAgainConfirmOpen(false);
    void runSeparation(true);
  }

  async function onRevertSeparation() {
    if (!project || !separationUndo) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.activateSeparationVersion(
        project.id,
        separationUndo.separationId,
      );
      setMix(m);
      setSeparationUndo(null);
      await openProject(project.id);
      const info = await api.loadSeparationInfo(project.id);
      setSeparationInfo(info);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRetryTake(_generationId: string) {
    if (!project || formError || scoreGate.error) {
      setShowFormErrors(true);
      setWorkspace("create");
      setAdvancedSettingsPage(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onGenerateLocal();
    } catch (e) {
      setError(generationErrorMessage(e));
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
        if (form.instrumentalMode && settings?.generationEngine !== "ace_step") {
          await generateInstrumentalComparisonTake(project.id, formForCall, scoreGate.abc);
        } else {
          await api.generateComparisonTake(project.id, formForCall, scoreGate.abc);
        }
      }
      await openProject(project.id);
    } catch (e) {
      setError(generationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateAceStep() {
    if (!project || formError || scoreGate.error) {
      setShowFormErrors(true);
      setWorkspace("create");
      setAdvancedSettingsPage(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.generateComparisonTake(project.id, form, scoreGate.abc, "ace_step");
      await openProject(project.id);
    } catch (e) {
      setError(generationErrorMessage(e));
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

  async function onSheetsageOpenScoreDraft(
    abc: string,
    meta: { mode: "melody" | "full" },
  ) {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const { document, empty, issues } = importAbcText(abc, {
        branchName: "sheetsage-draft",
      });
      if (empty) {
        setError(
          issues[0]?.message ??
            t("sheetsage.scoreDraftEmpty"),
        );
        return;
      }
      if (meta.mode === "melody" || meta.mode === "full") {
        setForm({ cot: meta.mode });
      }
      const { project: updated } = await api.saveScore(project.id, document);
      setScoreDocument({
        ...document,
        id: updated.activeScoreId ?? document.id,
      });
      await openProject(project.id);
      setScoreMode("edit");
      if (issues.length > 0) {
        setError(
          t("sheetsage.scoreDraftWarnings", {
            n: issues.length,
            detail: issues[0]?.message ?? "",
          }),
        );
      }
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

  function scheduleMixUpdate(
    next: MixDoc | null,
    opts?: { persist?: boolean },
  ) {
    if (!project || !next) return;
    const persist = opts?.persist !== false;
    setMixPreview(null);
    setMix(next);
    if (midiTrackMix) setMidiTrackMix(next);
    if (mixTimer.current) window.clearTimeout(mixTimer.current);
    if (!persist) return;
    // Persist on gesture end (caller skips persist during knob drag).
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
          tempoMap: next.tempoMap ?? [],
          timeSignatures: next.timeSignatures ?? [],
          markers: next.markers ?? [],
          vst3MasterInsert: next.vst3MasterInsert ?? undefined,
          clearVst3MasterInsert: !next.vst3MasterInsert,
        })
        .then((m) => {
          setMix(m);
          if (midiTrackMix) setMidiTrackMix(m);
          setMixSavedAt(new Date());
        })
        .catch((e) => setError(String(e)));
    }, 50);
  }

  const listeningMix = mixPreview ?? displayedMix;
  const showMixAssist =
    !!displayedMix &&
    displayedMix.tracks.length > 0 &&
    playbackSources?.mode === "stems" &&
    (playbackSources.stems?.length ?? 0) > 0;
  const showProductionCopilot = !!displayedMix && displayedMix.tracks.length > 0;
  const retryTakeBlockedReason = busy
    ? t("versions.interrupted.retryBlockedBusy")
    : formError || scoreGate.error
      ? t("versions.interrupted.retryBlockedForm")
      : null;
  const canRetryTake =
    !busy && !formError && Boolean(!scoreGate.error);

  return (
    <div
      className={`song-layout${
        workspace === "production"
          ? " song-layout-production song-layout-production-fill song-layout-has-dock"
          : ""
      }`}
    >
      <header className="song-workspace-chrome">
        <div className="song-workspace-chrome-top">
          <div className="song-workspace-project">
            <div className="song-workspace-title-row">
              <h1 className="song-title-with-badge">
                {project.title || t("form.createTitle")}
                <ProfileKindBadge />
              </h1>
              {screen === "create" && (
                <button
                  type="button"
                  className="btn song-create-batch-trigger"
                  onClick={() => setBatchOpen((open) => !open)}
                  aria-expanded={batchOpen}
                >
                  {t("batch.open")}
                </button>
              )}
            </div>
            {projectJob && projectJob.state !== "idle" && (
              <div className="song-job-banner" role="status" aria-live="polite">
                <span>
                  {projectJob.state === "completed"
                    ? t("job.completed")
                    : projectJob.state === "cancelled"
                      ? t("job.cancelled")
                      : generationErrorMessage(projectJob.label || t("job.generating"))}
                </span>
                {canCancelCurrentJob && (
                  <button
                    type="button"
                    className="btn ghost song-job-cancel"
                    disabled={cancelRequestPending || cancelRequested}
                    onClick={() => void onCancelCurrentJob()}
                  >
                    {cancelRequestPending ? t("job.canceling") : t("job.cancel")}
                  </button>
                )}
              </div>
            )}
            {cancelMessage && canCancelCurrentJob && (
              <p className="song-job-cancel-message" role="status">{cancelMessage}</p>
            )}
            {remoteProgress && (
              <p className="song-job-banner" role="status" aria-live="polite">
                {remoteProgress}
              </p>
            )}
          </div>
          {screen !== "create" && (
            <nav
              className="song-workspace-tabs"
              role="tablist"
              aria-label={t("workspace.nav")}
            >
              {WORKSPACES.filter((space) => screen !== "studio" || space !== "create").map((space) => (
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
          )}
        </div>
      </header>

      {screen === "create" && (
        <BatchGenerationPanel open={batchOpen} onClose={() => setBatchOpen(false)} />
      )}

      {pendingPart?.projectId === project.id && (
        <section className="panel" aria-label={t("production.instrumental.previewTitle")}>
          <h2>{t("production.instrumental.previewTitle")}</h2>
          <p>{t("production.instrumental.previewHelp")}</p>
          <TakePreviewPlayer audioPath={pendingPart.audioPath} label={pendingPart.name} />
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void acceptPendingPart(false)}>{t("production.instrumental.addSeparate")}</button>
            <button type="button" disabled={busy} onClick={() => void acceptPendingPart(true)}>{t("production.instrumental.useFullMix")}</button>
            <button type="button" disabled={busy} onClick={() => setPendingPart(null)}>{t("production.instrumental.keepForLater")}</button>
          </div>
          <p className="hint">{t("production.instrumental.fullMixHelp")}</p>
        </section>
      )}

      <div className="song-workspace-body">
        {workspace === "create" && (
          <CreateWorkspace
            advancedSettingsPage={advancedSettingsPage}
            advancedSummary={advancedSummary}
            busy={busy}
            form={form}
            formFieldErrors={formFieldErrors}
            onGenerate={onGenerate}
            onOpenInstrumentalSettings={openLoraSettings}
            onOpenVocalRemovalSettings={openSeparationSettings}
            scoreDocument={scoreDocument}
            scoreGate={scoreGate}
            setAdvancedSettingsPage={setAdvancedSettingsPage}
            setForm={setForm}
            instrumentalPackState={instrumentalPackState}
            showVocalRemovalGuidance={
              settings?.generationEngine === "yue2" ||
              settings?.generationEngine === "ace_step"
            }
            showInstrumentalPackGuidance={settings?.generationEngine === "yue2"}
            showFormErrors={showFormErrors}
          />
        )}

        {workspace === "score" && (
          <ScoreWorkspace
            busy={busy}
            canGenerateScoreOnly={canGenerateScoreOnly}
            scoreOnlyDisabledReason={scoreOnlyDisabledReason}
            form={form}
            generations={generations}
            mix={displayedMix}
            onGenerateScoreOnly={onGenerateScoreOnly}
            onRenderFromScore={onRenderFromScore}
            onSheetsageOpenScoreDraft={onSheetsageOpenScoreDraft}
            openProject={openProject}
            playback={playback}
            project={project}
            renderFromScoreCount={renderFromScoreCount}
            scoreAbc={scoreAbc}
            scoreDocument={scoreDocument}
            scoreMode={scoreMode}
            scoreOpen={scoreOpen}
            setBusy={setBusy}
            setError={setError}
            setForm={setForm}
            setRenderFromScoreCount={setRenderFromScoreCount}
            setScoreDocument={setScoreDocument}
            setScoreMode={setScoreMode}
            setScoreOpen={setScoreOpen}
          />
        )}

        {workspace === "production" && (
          <ProductionWorkspace
            busy={busy}
            form={form}
            importingAudio={importingAudio}
            listeningMix={listeningMix}
            mix={displayedMix}
            onExport={onExport}
            onImportUserAudio={onImportUserAudio}
            onAddMidiTrack={() => void onAddMidiTrack()}
            onEditMidiTrack={onEditMidiTrack}
            onSeparate={onSeparate}
            onRevertSeparation={
              separationUndo ? () => void onRevertSeparation() : undefined
            }
            onUserTrackAdded={onUserTrackAdded}
            onRequestInstrumentalPart={onRequestInstrumentalPart}
            legoSidecarReady={legoSidecarReady}
            legoLicenseAccepted={legoLicenseAccepted}
            playback={playback}
            playbackSources={playbackSources}
            project={project}
            recordOpen={recordOpen}
            roleByTrack={roleByTrack}
            scheduleMixUpdate={scheduleMixUpdate}
            mixSavedAt={mixSavedAt}
            scoreGate={scoreGate}
            separationInfo={separationInfo}
            setBusy={setBusy}
            setError={setError}
            setMixPreview={setMixPreview}
            setRecordOpen={setRecordOpen}
            showMixAssist={showMixAssist}
            showProductionCopilot={showProductionCopilot}
            sourceDurationMsByTrack={sourceDurationMsByTrack}
            clipViewPrefs={productionClipViewPrefs}
            onClipViewPrefsChange={patchProductionClipViewPrefs}
            onTranscribeBasicPitch={onTranscribeBasicPitch}
            transcribingTrackId={transcribingTrackId}
          />
        )}

        {workspace === "versions" && (
          <VersionsWorkspace
            busy={busy}
            candidateCount={candidateCount}
            continuationLyrics={continuationLyrics}
            generations={generations}
            onContinue={onContinue}
            onGenerateBatch={onGenerateBatch}
            onGenerateAceStep={onGenerateAceStep}
            onRevertSeparation={
              separationUndo ? () => void onRevertSeparation() : undefined
            }
            onRetryTake={(genId) => void onRetryTake(genId)}
            canRetryTake={canRetryTake}
            retryTakeBlockedReason={retryTakeBlockedReason}
            onSeparationSwitched={() => setSeparationUndo(null)}
            openProject={openProject}
            project={project}
            setCandidateCount={setCandidateCount}
            setContinuationLyrics={setContinuationLyrics}
          />
        )}
      </div>

      {midiEditorVoiceId && scoreDocument && (
        <div
          className="studio-midi-editor-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMidiEditorVoiceId(null);
          }}
        >
          <section
            className="studio-midi-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-midi-editor-title"
          >
            <header className="studio-midi-editor-header">
              <div>
                <p className="studio-midi-editor-eyebrow">{t("production.addTrack.midi")}</p>
                <h2 id="studio-midi-editor-title">{midiEditorTrackName ?? t("production.midi.editorTitle")}</h2>
                <p className="studio-midi-editor-state" role="status">
                  {displayedMix?.tracks.some((track) => track.id === midiEditorVoiceId)
                    ? t("production.midi.inArrangement")
                    : t("production.midi.addingToArrangement")}
                </p>
              </div>
              <button
                ref={midiEditorCloseRef}
                type="button"
                className="btn"
                onClick={() => setMidiEditorVoiceId(null)}
                aria-label={t("production.midi.close")}
              >
                {t("production.midi.close")}
              </button>
            </header>
            <div className="studio-midi-editor-content">
              <StudioMidiTrackEditor
                projectId={project.id}
                document={scoreDocument}
                voiceId={midiEditorVoiceId}
                onDocumentChange={setScoreDocument}
                onProjectRefresh={() => openProject(project.id, { preserveForm: true })}
                onError={setError}
              />
            </div>
          </section>
        </div>
      )}

      {remotePrefs && (
        <RemoteGenerateConfirm
          open={remoteConfirmOpen}
          prefs={remotePrefs}
          payloadPreview={remotePayload}
          busy={busy}
          onCancel={() => {
            setRemoteConfirmOpen(false);
            setRemoteProgress(null);
          }}
          onConfirm={onConfirmRemoteGenerate}
        />
      )}

      <SeparationAgainConfirmDialog
        open={separationAgainConfirmOpen}
        onCancel={() => setSeparationAgainConfirmOpen(false)}
        onConfirm={confirmSeparationAgain}
      />

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
