import { api } from "../lib/api";
import { AudioPlayer, type PlaybackView } from "../components/AudioPlayer";
import { buildGenerationPayload, loadRemotePrefs, runRemoteGenerationToProject } from "../lib/remoteGenerate";
import { CreateWorkspace } from "./song/CreateWorkspace";
import { matchesGenerateShortcut } from "./song/createWorkspaceLayout";
import { ensureProductionOverlay, normalizeProductionOverlay, setProductionDiskPersist, setProductionOverlay, setProductionTempoBpm, undoProductionOverlay, redoProductionOverlay } from "../lib/productionState";
import { exportProjectAudio } from "../lib/exportMix";
import { generateScoreOnly, renderNFromScore } from "../lib/scoreOnlyApi";
import { importAbcText, prepareAbcForGeneration, type ScoreDocument } from "../lib/score";
import { loadInvariantBaseline } from "../lib/invariants";
import { ProductionWorkspace } from "./song/ProductionWorkspace";
import { RegenerationGate } from "../components/RegenerationGate";
import { RemoteGenerateConfirm } from "../components/RemoteGenerateConfirm";
import { ScoreWorkspace } from "./song/ScoreWorkspace";
import { t } from "../ui/i18n";
import { useAppStore } from "../store/appStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { VersionsWorkspace } from "./song/VersionsWorkspace";
import type { BuiltRemotePayload, RemoteWorkerPreferences } from "@song-maker/remote-worker";
import type { FormInput, MixDoc, MixTrack, SeparationInfo } from "../lib/types";
import {
  advancedSettingsSummary,
  primaryFormError,
  validateFormFields,
  workspaceLabel,
  WORKSPACES,
  type AdvancedSettingsPage,
  type ProductionView,
  type ScoreMode,
  type SongWorkspace,
} from "./song/shared";

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
  const [separationUndo, setSeparationUndo] = useState<{
    separationId: string;
    mixId: string;
  } | null>(null);
  const [importingAudio, setImportingAudio] = useState(false);
  const [mixPreview, setMixPreview] = useState<MixDoc | null>(null);
  const [mixSavedAt, setMixSavedAt] = useState<Date | null>(null);
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
    const hasAiStems = mix?.tracks.some((tr) => tr.aiSeparated) ?? false;
    if (hasAiStems) {
      const ok = window.confirm(t("separate.again.confirm"));
      if (!ok) return;
    }
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
      if (hasAiStems && prevSep && prevMix) {
        setSeparationUndo({ separationId: prevSep, mixId: prevMix });
      } else {
        setSeparationUndo(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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
      await api.startGeneration(project.id, form, scoreGate.abc);
      await openProject(project.id);
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
        })
        .then((m) => {
          setMix(m);
          setMixSavedAt(new Date());
        })
        .catch((e) => setError(String(e)));
    }, 50);
  }

  const listeningMix = mixPreview ?? mix;
  const showMixAssist =
    !!mix &&
    mix.tracks.length > 0 &&
    playbackSources?.mode === "stems" &&
    (playbackSources.stems?.length ?? 0) > 0;
  const showProductionCopilot = !!mix && mix.tracks.length > 0;
  const splitTransport =
    workspace === "production" &&
    playbackSources?.mode === "stems" &&
    (mix?.tracks.some((tr) => tr.aiSeparated) ?? false);

  return (
    <div
      className={`song-layout${
        workspace === "production"
          ? " song-layout-production song-layout-production-fill"
          : ""
      }`}
    >
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
            delegateTransport={splitTransport}
            onError={setError}
            onPlaybackChange={setPlayback}
          />
        </div>
      </header>

      <div className="song-workspace-body">
        {workspace === "create" && (
          <CreateWorkspace
            advancedSettingsPage={advancedSettingsPage}
            advancedSummary={advancedSummary}
            busy={busy}
            form={form}
            formFieldErrors={formFieldErrors}
            onGenerate={onGenerate}
            scoreDocument={scoreDocument}
            scoreGate={scoreGate}
            setAdvancedSettingsPage={setAdvancedSettingsPage}
            setForm={setForm}
            showFormErrors={showFormErrors}
          />
        )}

        {workspace === "score" && (
          <ScoreWorkspace
            busy={busy}
            canGenerateScoreOnly={canGenerateScoreOnly}
            form={form}
            generations={generations}
            mix={mix}
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
            mix={mix}
            onExport={onExport}
            onImportUserAudio={onImportUserAudio}
            onSeparate={onSeparate}
            onRevertSeparation={
              separationUndo ? () => void onRevertSeparation() : undefined
            }
            onUserTrackAdded={onUserTrackAdded}
            playback={playback}
            playbackSources={playbackSources}
            productionView={productionView}
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
            setProductionView={setProductionView}
            setRecordOpen={setRecordOpen}
            showMixAssist={showMixAssist}
            showProductionCopilot={showProductionCopilot}
            sourceDurationMsByTrack={sourceDurationMsByTrack}
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
            onRevertSeparation={
              separationUndo ? () => void onRevertSeparation() : undefined
            }
            onRetryTake={(genId) => void onRetryTake(genId)}
            onSeparationSwitched={() => setSeparationUndo(null)}
            openProject={openProject}
            project={project}
            setCandidateCount={setCandidateCount}
            setContinuationLyrics={setContinuationLyrics}
          />
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
