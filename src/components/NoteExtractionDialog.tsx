import { useEffect, useId, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";
import { defaultExtractionOptions, extractedScore, extractionOptionsForMode,
  type ExtractionMode, type ExtractionOptions, type ExtractionResult } from "../lib/basicPitchExtraction";
import type { MixDoc, MixTrack } from "../lib/types";
import type { ScoreDocument } from "../lib/score";
import { t } from "../ui/i18n";
import { PianoRoll } from "./PianoRoll";
import { MidiInstrumentPanel } from "./MidiInstrumentPanel";
import { TAKE_PREVIEW_PLAY_EVENT } from "./TakePreviewPlayer";

type Props = {
  projectId: string;
  track: MixTrack;
  mix: MixDoc;
  initialClipId: string | null;
  previousOptions?: ScoreDocument["noteExtraction"];
  existingVoices?: ScoreDocument["voices"];
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onApply: (draft: ScoreDocument, replaceVoiceId: string | null) => Promise<void>;
};

function pitchName(pitch: number) {
  return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

/** Every extraction stays a local editable draft until the explicit Apply action. */
export function NoteExtractionDialog({ projectId, track, mix, initialClipId, previousOptions, existingVoices = [],
  onClose, onBusyChange, onApply }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const resultRef = useRef<ExtractionResult | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceIdentity = useRef({});
  const [options, setOptions] = useState<ExtractionOptions>(() => {
    const defaults = defaultExtractionOptions(track, initialClipId);
    if (previousOptions?.trackId !== track.id) return defaults;
    const { mode, sensitivity, minimumPitch, maximumPitch, minimumNoteMs } = previousOptions;
    return { mode, sensitivity, minimumPitch, maximumPitch, minimumNoteMs, clipId: initialClipId };
  });
  const [operation, setOperation] = useState<"analysis" | "apply" | null>(null);
  const busy = operation !== null;
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [draft, setDraft] = useState<ScoreDocument | null>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ startSeconds: 0, endSeconds: 8, loop: false });
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [replaceVoiceId, setReplaceVoiceId] = useState<string | null>(() => existingVoices.find(voice => voice.audioSourceTrackId === track.id)?.id ?? null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const activeClips = track.clips.filter(clip => clip.takeActive !== false && clip.sourcePath && clip.durationMs > 0);
  const totalSeconds = result?.durationSeconds ?? activeClips.reduce((end, clip) => Math.max(end, (clip.startMs + clip.durationMs) / 1000), 1);
  const changed = Boolean(result && (["mode", "sensitivity", "minimumPitch", "maximumPitch", "minimumNoteMs", "clipId"] as const)
    .some(key => result.options[key] !== options[key]));
  const validOptions = Number.isInteger(options.minimumPitch) && Number.isInteger(options.maximumPitch)
    && options.minimumPitch >= 21 && options.maximumPitch <= 108 && options.minimumPitch < options.maximumPitch
    && Number.isFinite(options.minimumNoteMs) && options.minimumNoteMs >= 30 && options.minimumNoteMs <= 1000;

  useEffect(() => {
    mounted.current = true;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      mounted.current = false;
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      dialog?.close();
      if (resultRef.current) void api.discardBasicpitchPreview(projectId, resultRef.current.previewId).catch(() => undefined);
      onBusyChange(false);
    };
  }, [projectId, onBusyChange]);

  useEffect(() => {
    const stopOther = (event: Event) => {
      if ((event as CustomEvent).detail !== sourceIdentity.current) {
        audioRef.current?.pause(); setSourcePlaying(false);
      }
    };
    window.addEventListener(TAKE_PREVIEW_PLAY_EVENT, stopOther);
    return () => window.removeEventListener(TAKE_PREVIEW_PLAY_EVENT, stopOther);
  }, []);

  useEffect(() => {
    if (!result) return;
    const audio = new Audio(convertFileSrc(result.sourceAudioPath));
    audio.preload = "metadata";
    audioRef.current = audio;
    const ended = () => {
      if (rangeRef.current.loop) {
        audio.currentTime = rangeRef.current.startSeconds;
        void audio.play().catch(() => setSourcePlaying(false));
      } else setSourcePlaying(false);
    };
    audio.addEventListener("ended", ended);
    return () => { audio.pause(); audio.removeEventListener("ended", ended); audio.src = ""; audioRef.current = null; };
  }, [result]);

  useEffect(() => {
    audioRef.current?.pause(); setSourcePlaying(false);
    window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: sourceIdentity.current }));
  }, [range.startSeconds, range.endSeconds, range.loop]);

  useEffect(() => {
    if (!sourcePlaying) return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.currentTime < range.endSeconds) return;
      if (range.loop) { audio.currentTime = range.startSeconds; void audio.play().catch(() => setSourcePlaying(false)); }
      else { audio.pause(); setSourcePlaying(false); }
    }, 25);
    return () => window.clearInterval(timer);
  }, [sourcePlaying, range]);

  async function analyze() {
    if (busy) return;
    setOperation("analysis"); onBusyChange(true); setError(null);
    audioRef.current?.pause(); setSourcePlaying(false);
    window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: sourceIdentity.current }));
    try {
      const next = await api.transcribeBasicpitch(projectId, track.id, options, mix);
      if (!mounted.current) { void api.discardBasicpitchPreview(projectId, next.previewId).catch(() => undefined); return; }
      if (resultRef.current) void api.discardBasicpitchPreview(projectId, resultRef.current.previewId).catch(() => undefined);
      resultRef.current = next;
      const document = extractedScore(next, track);
      setResult(next); setDraft(document); setSettingsExpanded(false);
      const first = next.notes.reduce((start, note) => Math.min(start, note.startSeconds), next.durationSeconds);
      const startSeconds = Math.max(0, Math.min(next.durationSeconds - 0.1, first - 0.2));
      setRange({ startSeconds, endSeconds: Math.min(next.durationSeconds, startSeconds + 8), loop: false });
    } catch (cause) {
      if (mounted.current) setError(String(cause));
    } finally {
      if (mounted.current) { setOperation(null); onBusyChange(false); }
    }
  }

  async function listenSource() {
    const audio = audioRef.current;
    if (!audio) return;
    window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: sourceIdentity.current }));
    setError(null);
    setSourcePlaying(true);
    try { audio.currentTime = range.startSeconds; await audio.play(); }
    catch { if (mounted.current) { setSourcePlaying(false); setError(t("extraction.listenError")); } }
  }

  async function apply() {
    if (!draft || busy || changed) return;
    setOperation("apply"); onBusyChange(true); setError(null);
    audioRef.current?.pause(); setSourcePlaying(false);
    window.dispatchEvent(new CustomEvent(TAKE_PREVIEW_PLAY_EVENT, { detail: sourceIdentity.current }));
    try { await onApply(draft, replaceVoiceId); }
    catch (cause) { if (mounted.current) setError(String(cause)); }
    finally { if (mounted.current) { setOperation(null); onBusyChange(false); } }
  }

  return <dialog ref={dialogRef} className="note-extraction-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="note-extraction-header">
      <div><h2 id={titleId}>{t("extraction.title", { track: track.name })}</h2><p className="hint">{t("extraction.draftHint")}</p></div>
      <button className="btn ghost" type="button" disabled={busy} onClick={onClose} aria-label={t("extraction.close")}>×</button>
    </header>
    <div className="note-extraction-body">
      <details className="note-extraction-analysis" open={settingsExpanded} onToggle={event => setSettingsExpanded(event.currentTarget.open)}>
      <summary>{t("extraction.settings")} · {t(`extraction.mode.${options.mode}`)} · {t(`extraction.sensitivity.${options.sensitivity}`)}</summary>
      <fieldset className="note-extraction-options" disabled={busy} aria-label={t("extraction.settings")}>
        <label><span>{t("extraction.mode")}</span><select value={options.mode} onChange={event => {
          const mode = event.target.value as ExtractionMode;
          setOptions(current => ({ ...current, ...extractionOptionsForMode(mode), sensitivity: current.sensitivity, clipId: current.clipId }));
        }}>{(["voice", "bass", "polyphonic"] as const).map(mode => <option key={mode} value={mode}>{t(`extraction.mode.${mode}`)}</option>)}</select></label>
        <label><span>{t("extraction.sensitivity")}</span><select value={options.sensitivity} onChange={event => setOptions(current => ({ ...current, sensitivity: event.target.value as ExtractionOptions["sensitivity"] }))}>
          {(["conservative", "balanced", "detailed"] as const).map(value => <option key={value} value={value}>{t(`extraction.sensitivity.${value}`)}</option>)}
        </select></label>
        <label><span>{t("extraction.scope")}</span><select value={options.clipId ?? ""} onChange={event => setOptions(current => ({ ...current, clipId: event.target.value || null }))}>
          <option value="">{t("extraction.wholeTrack")}</option>
          {activeClips.map((clip, index) => <option key={clip.id} value={clip.id}>{t("extraction.clip", { n: index + 1, seconds: (clip.startMs / 1000).toFixed(1) })}</option>)}
        </select></label>
      </fieldset>
      <p className="hint">{t(`extraction.modeHint.${options.mode}`)}</p>
      <details className="note-extraction-advanced"><summary>{t("extraction.advanced")}</summary><fieldset disabled={busy} className="note-extraction-options">
        <label><span>{t("extraction.minimumPitch", { note: pitchName(options.minimumPitch) })}</span><input type="number" min={21} max={options.maximumPitch - 1} step={1} value={options.minimumPitch} onChange={event => setOptions(current => ({ ...current, minimumPitch: Number(event.target.value) }))} /></label>
        <label><span>{t("extraction.maximumPitch", { note: pitchName(options.maximumPitch) })}</span><input type="number" min={options.minimumPitch + 1} max={108} step={1} value={options.maximumPitch} onChange={event => setOptions(current => ({ ...current, maximumPitch: Number(event.target.value) }))} /></label>
        <label><span>{t("extraction.minimumNote")}</span><input type="number" min={30} max={1000} step={0.1} value={options.minimumNoteMs} onChange={event => setOptions(current => ({ ...current, minimumNoteMs: Number(event.target.value) }))} /></label>
      </fieldset><p className="hint">{t("extraction.filterHint")}</p></details>
      {!validOptions && <p className="error" role="alert">{t("extraction.invalidOptions")}</p>}
      <button type="button" className="btn primary" disabled={busy || !validOptions} onClick={() => void analyze()}>{t(operation === "analysis" ? "basicPitch.busy" : result ? "extraction.analyzeAgain" : "extraction.analyze")}</button>
      </details>
      {busy && <p className="hint" role="status" aria-live="polite">{t(operation === "apply" ? "extraction.applying" : "extraction.progress")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && draft && <fieldset className="note-extraction-review" disabled={busy}>
        <h3>{t("extraction.result", { n: draft.voices.reduce((n, voice) => n + voice.notes.length, 0) })}</h3>
        {existingVoices.some(voice => voice.notes.length) && <label className="note-extraction-destination"><span>{t("extraction.destination")}</span>
          <select value={replaceVoiceId ?? ""} onChange={event => setReplaceVoiceId(event.target.value || null)}>
            <option value="">{t("extraction.newPart")}</option>
            {existingVoices.map(voice => <option key={voice.id} value={voice.id}>{t("extraction.replacePart", { name: voice.name })}</option>)}
          </select></label>}
        {changed && <p className="banner warn" role="status">{t("extraction.changed")}</p>}
        {!result.notes.length && <p className="hint">{t("extraction.noNotes")}</p>}
        <div className="note-extraction-comparison">
          <p className="hint">{t("extraction.comparisonHint")}</p>
          <div className="note-extraction-options">
            <label><span>{t("extraction.start")}</span><input type="number" min={0} max={range.endSeconds - 0.1} step={0.01} value={Number(range.startSeconds.toFixed(2))} onChange={event => setRange(current => ({ ...current, startSeconds: Math.max(0, Math.min(current.endSeconds - 0.1, Number(event.target.value))) }))} /></label>
            <label><span>{t("extraction.end")}</span><input type="number" min={range.startSeconds + 0.1} max={totalSeconds} step={0.01} value={Number(range.endSeconds.toFixed(2))} onChange={event => setRange(current => ({ ...current, endSeconds: Math.max(current.startSeconds + 0.1, Math.min(totalSeconds, Number(event.target.value))) }))} /></label>
            <label className="note-extraction-loop"><input type="checkbox" checked={range.loop} onChange={event => setRange(current => ({ ...current, loop: event.target.checked }))} /><span>{t("extraction.loop")}</span></label>
          </div>
          <div className="note-extraction-source-controls"><button type="button" className="btn" disabled={busy || sourcePlaying} onClick={() => void listenSource()}>▶ {t("extraction.listenSource")}</button>
            <button type="button" className="btn" disabled={!sourcePlaying} onClick={() => { audioRef.current?.pause(); setSourcePlaying(false); }}>■ {t("midi.stop")}</button></div>
          <div className="note-extraction-note-controls" ref={setToolbarTarget} />
        </div>
        <PianoRoll document={draft} activeVoiceId={draft.voices[0]?.id} onChange={setDraft} onError={setError} />
        <details className="note-extraction-instrument"><summary>{t("extraction.instrument")}</summary>
          <MidiInstrumentPanel document={draft} voiceId={draft.voices[0]?.id} onDocumentChange={setDraft}
            latencyMs={20} onError={setError} playbackToolbarTarget={toolbarTarget} playbackRange={range} auditionOnly />
        </details>
      </fieldset>}
    </div>
    <footer className="note-extraction-footer"><p className="hint">{t("extraction.applyHint")}</p><div className="btn-row">
      <button type="button" className="btn" disabled={busy} onClick={onClose}>{t("extraction.discard")}</button>
      <button type="button" className="btn primary" disabled={busy || changed || !draft?.voices.some(voice => voice.notes.length)} onClick={() => void apply()}>{t(operation === "apply" ? "extraction.applying" : "extraction.apply")}</button>
    </div></footer>
  </dialog>;
}
