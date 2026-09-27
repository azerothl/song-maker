import { useEffect, useMemo, useRef, useState } from "react";
import { AudioPlayer, type PlaybackView } from "../components/AudioPlayer";
import { CandidateCompare } from "../components/CandidateCompare";
import { ClipTimeline } from "../components/ClipTimeline";
import { Phase3MixPanel } from "../components/Phase3MixPanel";
import { ScorePanel } from "../components/ScorePanel";
import { VersionGraph } from "../components/VersionGraph";
import { Waveform } from "../components/Waveform";
import { api } from "../lib/api";
import { exportProjectAudio } from "../lib/exportMix";
import { prepareAbcForGeneration } from "../lib/score";
import type { FormInput, MixDoc, MixTrack } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const METERS = ["", "4/4", "3/4", "6/8", "2/4"];
const DURATION_SEC_MIN = 30;
const DURATION_SEC_MAX = 360;
const DURATION_SEC_STEP = 30;

const TITLE_FORBIDDEN = /[/\\:*?"<>|]/;

function formatDurationLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function snapDurationSec(raw: number): number {
  const clamped = Math.min(DURATION_SEC_MAX, Math.max(DURATION_SEC_MIN, raw));
  return Math.round(clamped / DURATION_SEC_STEP) * DURATION_SEC_STEP;
}

function validateForm(form: FormInput): string | null {
  const title = form.title.trim();
  if (!title || title.length > 120 || title.endsWith(".") || TITLE_FORBIDDEN.test(title)) {
    return "Titre invalide.";
  }
  if (!form.style.trim()) return "Style obligatoire.";
  const lyrics = form.lyrics.trim();
  if (!lyrics || lyrics.length > 4000) return "Paroles obligatoires (1–4000).";
  const dur = form.targetDurationSec;
  if (
    !Number.isFinite(dur) ||
    dur < DURATION_SEC_MIN ||
    dur > DURATION_SEC_MAX ||
    dur % DURATION_SEC_STEP !== 0
  ) {
    return "Durée cible : 0:30 à 6:00, par pas de 30 s.";
  }
  return null;
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
  const [continuationLyrics, setContinuationLyrics] = useState("");
  const saveTimer = useRef<number | null>(null);
  const mixTimer = useRef<number | null>(null);

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

  const formError = useMemo(() => validateForm(form), [form]);
  const scoreGate = useMemo(
    () => prepareAbcForGeneration(scoreDocument, form.cot, form.title),
    [scoreDocument, form.cot, form.title],
  );
  const canGenerate = !formError && !busy && !scoreGate.error;

  useEffect(() => {
    setShowFormErrors(false);
  }, [project?.id]);

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
          return;
        }
        void onGenerate();
      }
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        void api.undoMix(project.id).then((m) => m && setMix(m));
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void api.redoMix(project.id).then((m) => m && setMix(m));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!project) return null;

  async function onGenerate() {
    if (!project) return;
    if (formError || scoreGate.error) {
      setShowFormErrors(true);
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
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateBatch(count: number) {
    if (!project || formError || scoreGate.error) {
      setShowFormErrors(true);
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

  function scheduleMixUpdate(next: MixDoc | null) {
    if (!project || !next) return;
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

  return (
    <div className="song-layout">
      <aside className="song-form">
        <label>
          {t("form.title")}
          <input
            value={form.title}
            onChange={(e) => setForm({ title: e.target.value })}
            maxLength={120}
          />
        </label>
        <label>
          {t("form.style")}
          <textarea
            value={form.style}
            onChange={(e) => setForm({ style: e.target.value })}
            rows={3}
          />
          <span className="counter">{form.style.length}/1000</span>
        </label>
        <label>
          {t("form.lyrics")}
          <textarea
            value={form.lyrics}
            onChange={(e) => setForm({ lyrics: e.target.value })}
            rows={10}
          />
          <span className="counter">{form.lyrics.length}/4000</span>
          <span className="hint">{t("form.lyrics.tags")}</span>
        </label>
        <label>
          {t("form.cot")}
          <select
            value={form.cot}
            onChange={(e) => setForm({ cot: e.target.value })}
          >
            <option value="full">{t("form.cot.full")}</option>
            <option value="melody">{t("form.cot.melody")}</option>
            <option value="off">{t("form.cot.off")}</option>
          </select>
        </label>
        <label>
          {t("form.language")}
          <input
            value={form.singingLanguage ?? ""}
            onChange={(e) =>
              setForm({ singingLanguage: e.target.value || null })
            }
            maxLength={40}
          />
        </label>
        <label>
          {t("form.tempo")}
          <input
            type="number"
            min={40}
            max={220}
            value={form.tempoBpm ?? ""}
            onChange={(e) =>
              setForm({
                tempoBpm: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          {t("form.duration")}
          <input
            type="range"
            className="duration-slider"
            min={DURATION_SEC_MIN}
            max={DURATION_SEC_MAX}
            step={DURATION_SEC_STEP}
            value={form.targetDurationSec}
            onChange={(e) =>
              setForm({ targetDurationSec: snapDurationSec(Number(e.target.value)) })
            }
          />
          <span className="counter">
            {t("form.duration.hint", {
              duration: formatDurationLabel(form.targetDurationSec),
            })}
          </span>
        </label>
        <label className="form-toggle">
          <input
            type="checkbox"
            checked={form.preferFullLyrics}
            onChange={(e) => setForm({ preferFullLyrics: e.target.checked })}
          />
          <span>{t("form.duration.preferLyrics")}</span>
        </label>
        {!form.preferFullLyrics && (
          <p className="hint warn">{t("form.duration.strictHint")}</p>
        )}
        <label>
          {t("form.key")}
          <div className="row">
            <select
              value={form.key?.tonic ?? ""}
              onChange={(e) => {
                const tonic = e.target.value;
                if (!tonic) setForm({ key: null });
                else
                  setForm({
                    key: { tonic, mode: form.key?.mode ?? "major" },
                  });
              }}
            >
              <option value="">—</option>
              {TONICS.map((tonic) => (
                <option key={tonic} value={tonic}>
                  {tonic}
                </option>
              ))}
            </select>
            <select
              value={form.key?.mode ?? "major"}
              disabled={!form.key}
              onChange={(e) =>
                form.key &&
                setForm({ key: { ...form.key, mode: e.target.value } })
              }
            >
              <option value="major">major</option>
              <option value="minor">minor</option>
            </select>
          </div>
        </label>
        <label>
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
                setForm({ meter: { numerator: n, denominator: d } });
              }
            }}
          >
            {METERS.map((m) => (
              <option key={m || "none"} value={m}>
                {m || "—"}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("form.seed")}
          <input
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
              setForm({ seed: Math.min(Math.trunc(n), 4294967295) });
            }}
          />
        </label>
        {showFormErrors && formError && (
          <p className="hint error">{formError}</p>
        )}
        {scoreGate.error && <p className="hint error">{scoreGate.error}</p>}
        {scoreDocument && !scoreGate.error && (
          <p className="hint ok">{t("score.willSendAbc")}</p>
        )}
        {!scoreDocument && (
          <p className="hint">{t("score.phase1Path")}</p>
        )}
        {job && job.state !== "idle" && (
          <p className="hint job">{job.label || t("job.generating")}</p>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={!canGenerate}
            onClick={() => void onGenerate()}
          >
            {t("generate.button")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!project.activeGenerationId || busy}
            onClick={() => void onSeparate()}
          >
            {t("separate.button")}
          </button>
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
        <p className="hint">{t("stopAfter.gated")}</p>
      </aside>

      <section className="song-stage">
        <AudioPlayer
          projectId={project.id}
          sources={playbackSources}
          mix={mix}
          onError={setError}
          onPlaybackChange={setPlayback}
        />

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

        <details className="score-edit-section">
          <summary>{t("score.editor")}</summary>
          <ScorePanel
            projectId={project.id}
            document={scoreDocument}
            cot={form.cot}
            title={form.title}
            onDocumentChange={setScoreDocument}
            onProjectRefresh={() => openProject(project.id)}
            onError={setError}
            onCotChange={(cot) => setForm({ cot })}
          />
        </details>

        {generations.find((g) => g.id === project.activeGenerationId)
          ?.semanticTruncated && (
          <section className="continuation-panel" aria-labelledby="continue-title">
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
              disabled={busy || !continuationLyrics.trim() || !generations.find((g) => g.id === project.activeGenerationId)?.canContinue}
              onClick={() => {
                const active = generations.find((g) => g.id === project.activeGenerationId);
                if (active) void onContinue(active.id);
              }}
            >
              {t("generations.continue")}
            </button>
          </section>
        )}

        {mix ? (
          <div className="mixer">
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
              <span>{mix.masterGainDb.toFixed(1)} dB</span>
            </label>
            {mix.tracks.map((tr) => {
              const anySolo = mix.tracks.some((x) => x.solo);
              const muted = tr.mute || (anySolo && !tr.solo);
              const peaks = playback?.peaksByTrack[tr.id] ?? null;
              return (
                <div key={tr.id} className="track" data-role={tr.role.toLowerCase()}>
                  <strong>{tr.name}</strong>
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
                      onSeek={playback?.seek}
                    />
                  </div>
                  <label>
                    {t("mix.gain")}
                    <input
                      type="range"
                      min={-24}
                      max={12}
                      step={0.5}
                      value={tr.gainDb}
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
                  <label>
                    {t("mix.pan")}
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={tr.pan}
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
            <ClipTimeline mix={mix} onChange={scheduleMixUpdate} />
          </div>
        ) : (
          <p className="hint">Stéréo — lancez la séparation pour les quatre pistes.</p>
        )}

        {mix && (
          <details className="advanced-production">
            <summary>{t("phase3.mix.title")}</summary>
            <Phase3MixPanel mix={mix} />
          </details>
        )}

        <details
          open={scoreOpen}
          onToggle={(e) => setScoreOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>{t("score.toggle")}</summary>
          <pre className="score">{scoreAbc ?? t("score.empty")}</pre>
        </details>

        <details className="version-history">
          <summary>{t("versions.history", { count: String(generations.length) })}</summary>
          <VersionGraph
            generations={generations}
            activeId={project.activeGenerationId}
            onUse={(genId) => {
              void api
                .useGeneration(project.id, genId)
                .then(() => openProject(project.id));
            }}
          />
        </details>
      </section>
    </div>
  );
}
