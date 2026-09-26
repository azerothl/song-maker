import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { FormInput, MixDoc, MixTrack } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const METERS = ["", "4/4", "3/4", "6/8", "2/4"];

const TITLE_FORBIDDEN = /[/\\:*?"<>|]/;

function validateForm(form: FormInput): string | null {
  const title = form.title.trim();
  if (!title || title.length > 120 || title.endsWith(".") || TITLE_FORBIDDEN.test(title)) {
    return "Titre invalide.";
  }
  if (!form.style.trim()) return "Style obligatoire.";
  const lyrics = form.lyrics.trim();
  if (!lyrics || lyrics.length > 4000) return "Paroles obligatoires (1–4000).";
  for (const line of form.lyrics.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const allowed = [
        "[Intro]",
        "[Verse]",
        "[Verse 2]",
        "[Pre-Chorus]",
        "[Chorus]",
        "[Bridge]",
        "[Outro]",
        "[Instrumental]",
      ];
      if (!allowed.includes(trimmed)) return `Balise refusée : ${trimmed}`;
    }
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
  const scoreOpen = useAppStore((s) => s.scoreOpen);
  const setScoreOpen = useAppStore((s) => s.setScoreOpen);
  const audioPath = useAppStore((s) => s.audioPath);
  const setError = useAppStore((s) => s.setError);
  const openProject = useAppStore((s) => s.openProject);
  const job = useAppStore((s) => s.job);

  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const mixTimer = useRef<number | null>(null);

  const formError = useMemo(() => validateForm(form), [form]);
  const canGenerate = !formError && !busy;

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
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePlay();
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        void api.saveProjectForm(project.id, form);
      }
      if (mod && e.key === "Enter" && canGenerate) {
        e.preventDefault();
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

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  async function onGenerate() {
    if (!project || formError) return;
    setBusy(true);
    setError(null);
    try {
      await api.startGeneration(project.id, form);
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
            onChange={(e) =>
              setForm({ seed: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        {formError && <p className="hint error">{formError}</p>}
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
            disabled={!project.activeGenerationId}
            onClick={() =>
              void api
                .exportAudio(project.id, "wav")
                .then((p) => window.alert(p))
                .catch((e) => setError(String(e)))
            }
          >
            {t("export.wav")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!project.activeGenerationId}
            onClick={() =>
              void api
                .exportAudio(project.id, "flac")
                .then((p) => window.alert(p))
                .catch((e) => setError(String(e)))
            }
          >
            {t("export.flac")}
          </button>
        </div>
      </aside>

      <section className="song-stage">
        <div className="player">
          <button type="button" className="btn" onClick={togglePlay}>
            {playing ? t("player.pause") : t("player.play")}
          </button>
          {audioPath && (
            <audio
              ref={audioRef}
              src={`asset://localhost/${encodeURIComponent(audioPath)}`}
              onEnded={() => setPlaying(false)}
            />
          )}
          <span className="path">{audioPath ?? t("library.dash")}</span>
        </div>

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
            {mix.tracks.map((tr) => (
              <div key={tr.id} className="track">
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
            ))}
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
          <p className="hint">Stéréo — lancez la séparation pour les quatre pistes.</p>
        )}

        <details
          open={scoreOpen}
          onToggle={(e) => setScoreOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>{t("score.toggle")}</summary>
          <pre className="score">{scoreAbc ?? t("score.empty")}</pre>
        </details>

        <div className="generations">
          <h2>{t("generations.title")}</h2>
          <ul>
            {generations.map((g) => (
              <li key={g.id}>
                <span>
                  {g.id} · seed {g.seed} · {g.cot} · {g.state}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (window.confirm(t("generations.useHint"))) {
                      void api.useGeneration(project.id, g.id).then(() => openProject(project.id));
                    }
                  }}
                >
                  {t("generations.use")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
