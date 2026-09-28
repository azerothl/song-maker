import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { AbcVoiceTarget, ModeName, ScoreDocument, SectionKind } from "../lib/score";
import {
  addNote,
  deleteNote,
  primaryVoiceId,
  quantizeScore,
  removeChord,
  removeSection,
  setVoiceAbcRole,
  transposeScoreNotes,
  updateNote,
  updateScoreKey,
  updateScoreMeter,
  updateScoreTempo,
  upsertChord,
  upsertSection,
} from "../lib/score";
import { SoftSynth } from "../lib/midiInstrument";
import { t } from "../ui/i18n";

const SECTION_KINDS: SectionKind[] = [
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "interlude",
  "outro",
  "other",
];

const TONICS = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
];

const PITCH_MIN = 48;
const PITCH_MAX = 84;
const PX_PER_TICK = 0.04;
const ROW_H = 14;
const QUANTIZE_TICKS = 120;

type Props = {
  document: ScoreDocument;
  onChange: (doc: ScoreDocument) => void;
  onError?: (msg: string | null) => void;
};

export function PianoRoll({ document, onChange, onError }: Props) {
  const defaultVoice = primaryVoiceId(document);
  const [voiceId, setVoiceId] = useState<string | null>(defaultVoice);
  const voice = document.voices.find((v) => v.id === voiceId) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionKind, setSectionKind] = useState<SectionKind>("verse");
  const [pendingQuantize, setPendingQuantize] = useState(false);
  const [chordSymbol, setChordSymbol] = useState("C");
  const [chordTick, setChordTick] = useState(0);
  const tempo = document.tempoMap[0]?.quarterBpm ?? 120;
  const key = document.keySignatures[0] ?? { tick: 0, tonic: "C", mode: "major" as ModeName };
  const meter = document.timeSignatures[0] ?? {
    tick: 0,
    numerator: 4,
    denominator: 4,
  };
  const selectedNote = voice?.notes.find((n) => n.id === selectedId) ?? null;
  const auditionRef = useRef<SoftSynth | null>(null);

  useEffect(() => {
    const synth = new SoftSynth({ latencySec: 0.01 });
    auditionRef.current = synth;
    return () => {
      void synth.dispose();
      auditionRef.current = null;
    };
  }, []);

  function audition(pitch: number) {
    const synth = auditionRef.current;
    if (!synth) return;
    void synth.noteOn(pitch, 95).then(() => {
      window.setTimeout(() => synth.noteOff(pitch), 180);
    });
  }

  useEffect(() => {
    if (!voiceId || !document.voices.some((v) => v.id === voiceId)) {
      setVoiceId(primaryVoiceId(document));
    }
  }, [document, voiceId]);

  const maxTick = useMemo(() => {
    let m = 3840;
    for (const n of voice?.notes ?? []) {
      m = Math.max(m, n.startTick + n.durationTick + 960);
    }
    for (const s of document.sections) {
      m = Math.max(m, s.startTick + 1920);
    }
    return m;
  }, [voice, document.sections]);

  const width = Math.max(640, maxTick * PX_PER_TICK);
  const height = (PITCH_MAX - PITCH_MIN + 1) * ROW_H;

  function pitchToY(pitch: number): number {
    return (PITCH_MAX - pitch) * ROW_H;
  }

  function yToPitch(y: number): number {
    const p = PITCH_MAX - Math.floor(y / ROW_H);
    return Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
  }

  function onCanvasClick(e: MouseEvent<HTMLDivElement>) {
    if (!voiceId || !voice) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const y = e.clientY - rect.top;
    if (e.detail === 2) {
      const startTick = Math.max(0, Math.round(x / PX_PER_TICK / 120) * 120);
      const pitch = yToPitch(y);
      const id = `n-${Date.now().toString(36)}`;
      onChange(
        addNote(document, voiceId, {
          id,
          startTick,
          durationTick: 480,
          pitch,
          velocity: 90,
        }),
      );
      setSelectedId(id);
      audition(pitch);
      return;
    }
    setSelectedId(null);
  }

  function onNotePointerDown(
    e: PointerEvent,
    noteId: string,
    startTick: number,
    pitch: number,
  ) {
    e.stopPropagation();
    if (!voiceId) return;
    setSelectedId(noteId);
    audition(pitch);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const originX = e.clientX;
    const originY = e.clientY;
    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      const nextStart = Math.max(
        0,
        Math.round((startTick + dx / PX_PER_TICK) / 120) * 120,
      );
      const nextPitch = Math.min(
        PITCH_MAX,
        Math.max(PITCH_MIN, pitch - Math.round(dy / ROW_H)),
      );
      onChange(
        updateNote(document, voiceId, noteId, {
          startTick: nextStart,
          pitch: nextPitch,
        }),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function deleteSelected() {
    if (!voiceId || !selectedId) return;
    onChange(deleteNote(document, voiceId, selectedId));
    setSelectedId(null);
  }

  function bumpDuration(delta: number) {
    if (!voiceId || !selectedId || !voice) return;
    const note = voice.notes.find((n) => n.id === selectedId);
    if (!note) return;
    const durationTick = Math.max(120, note.durationTick + delta);
    onChange(updateNote(document, voiceId, selectedId, { durationTick }));
  }

  function bumpPitch(delta: number) {
    if (!voiceId || !selectedId || !selectedNote) return;
    const pitch = Math.min(127, Math.max(0, selectedNote.pitch + delta));
    onChange(updateNote(document, voiceId, selectedId, { pitch }));
  }

  function bumpStart(deltaTicks: number) {
    if (!voiceId || !selectedId || !selectedNote) return;
    const startTick = Math.max(0, selectedNote.startTick + deltaTicks);
    onChange(updateNote(document, voiceId, selectedId, { startTick }));
  }

  function addSectionAtPlayhead() {
    const startTick = selectedId
      ? (voice?.notes.find((n) => n.id === selectedId)?.startTick ?? 0)
      : 0;
    const id = `sec-${Date.now().toString(36)}`;
    onChange(
      upsertSection(document, {
        id,
        kind: sectionKind,
        startTick,
      }),
    );
  }

  function applyTranspose(semitones: number) {
    const selection = selectedId && voiceId
      ? { voiceIds: [voiceId], noteIds: [selectedId] }
      : voiceId
        ? { voiceIds: [voiceId] }
        : undefined;
    onChange(transposeScoreNotes(document, semitones, selection));
  }

  function confirmQuantize(apply: boolean) {
    setPendingQuantize(false);
    if (!apply) return;
    onChange(quantizeScore(document, QUANTIZE_TICKS));
  }

  function addChord() {
    const { doc, error } = upsertChord(document, chordTick, chordSymbol.trim());
    if (error) {
      onError?.(error);
      return;
    }
    onError?.(null);
    onChange(doc);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      bumpPitch(e.shiftKey ? 12 : 1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      bumpPitch(e.shiftKey ? -12 : -1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      bumpStart(e.shiftKey ? -480 : -120);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      bumpStart(e.shiftKey ? 480 : 120);
    }
  }

  return (
    <div
      className="piano-roll"
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="application"
      aria-label={t("score.pianoHint")}
    >
      <div className="piano-toolbar">
        <label>
          {t("score.voice")}
          <select
            value={voiceId ?? ""}
            onChange={(e) => {
              setVoiceId(e.target.value || null);
              setSelectedId(null);
            }}
          >
            {document.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.abcVoice ?? v.role})
              </option>
            ))}
          </select>
        </label>
        {voiceId && (
          <label>
            {t("score.abcRole")}
            <select
              value={voice?.abcVoice ?? (voice?.role === "vocal" || voice?.role === "melody" ? "Vocal" : "Ins")}
              onChange={(e) =>
                onChange(
                  setVoiceAbcRole(
                    document,
                    voiceId,
                    e.target.value as AbcVoiceTarget,
                    e.target.value === "Vocal" ? "vocal" : "other",
                  ),
                )
              }
            >
              <option value="Vocal">Vocal</option>
              <option value="Ins">Ins</option>
            </select>
          </label>
        )}
        <label>
          {t("score.tempo")}
          <input
            type="number"
            min={40}
            max={220}
            value={tempo}
            onChange={(e) =>
              onChange(updateScoreTempo(document, Number(e.target.value) || 120))
            }
          />
        </label>
        <label>
          {t("score.key")}
          <select
            value={key.tonic}
            onChange={(e) =>
              onChange(updateScoreKey(document, e.target.value, key.mode))
            }
          >
            {TONICS.map((tonic) => (
              <option key={tonic} value={tonic}>
                {tonic}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("score.mode")}
          <select
            value={key.mode}
            onChange={(e) =>
              onChange(
                updateScoreKey(document, key.tonic, e.target.value as ModeName),
              )
            }
          >
            <option value="major">major</option>
            <option value="minor">minor</option>
          </select>
        </label>
        <label>
          {t("score.meterNum")}
          <input
            type="number"
            min={1}
            max={16}
            value={meter.numerator}
            onChange={(e) =>
              onChange(
                updateScoreMeter(
                  document,
                  Number(e.target.value) || 4,
                  meter.denominator,
                ),
              )
            }
          />
        </label>
        <label>
          {t("score.meterDen")}
          <select
            value={meter.denominator}
            onChange={(e) =>
              onChange(
                updateScoreMeter(
                  document,
                  meter.numerator,
                  Number(e.target.value) || 4,
                ),
              )
            }
          >
            {[1, 2, 4, 8, 16].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("score.velocity")}
          <input
            type="number"
            min={1}
            max={127}
            disabled={!selectedNote}
            value={selectedNote?.velocity ?? 90}
            onChange={(e) => {
              if (!voiceId || !selectedId) return;
              onChange(
                updateNote(document, voiceId, selectedId, {
                  velocity: Math.min(
                    127,
                    Math.max(1, Number(e.target.value) || 90),
                  ),
                }),
              );
            }}
          />
        </label>
        <label>
          {t("score.section")}
          <select
            value={sectionKind}
            onChange={(e) => setSectionKind(e.target.value as SectionKind)}
          >
            {SECTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={addSectionAtPlayhead}>
          {t("score.sectionAdd")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selectedId}
          onClick={deleteSelected}
        >
          {t("score.noteDelete")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selectedId}
          onClick={() => bumpDuration(120)}
        >
          {t("score.noteLonger")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selectedId}
          onClick={() => bumpDuration(-120)}
        >
          {t("score.noteShorter")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyTranspose(1)}
          title={t("score.transposeHint")}
        >
          {t("score.transposeUp")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyTranspose(-1)}
          title={t("score.transposeHint")}
        >
          {t("score.transposeDown")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyTranspose(12)}
        >
          {t("score.transposeOctUp")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => applyTranspose(-12)}
        >
          {t("score.transposeOctDown")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setPendingQuantize(true)}
        >
          {t("score.quantize")}
        </button>
        <span className="hint">{t("score.pianoHint")}</span>
      </div>

      {pendingQuantize && (
        <div className="banner warn">
          <span>{t("score.quantizeAsk")}</span>
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => confirmQuantize(true)}
            >
              {t("score.quantizeYes")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => confirmQuantize(false)}
            >
              {t("score.quantizeNo")}
            </button>
          </div>
        </div>
      )}

      <div className="chord-editor">
        <label>
          {t("score.chordTick")}
          <input
            type="number"
            min={0}
            step={120}
            value={chordTick}
            onChange={(e) => setChordTick(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label>
          {t("score.chordSymbol")}
          <input
            type="text"
            value={chordSymbol}
            onChange={(e) => setChordSymbol(e.target.value)}
          />
        </label>
        <button type="button" className="btn" onClick={addChord}>
          {t("score.chordAdd")}
        </button>
      </div>

      {document.chordEvents.length > 0 && (
        <ul className="section-list chord-list">
          {document.chordEvents.map((c) => (
            <li key={`ch-${c.tick}`}>
              <span>
                {c.symbol} @ {c.tick}
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => onChange(removeChord(document, c.tick))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {document.sections.length > 0 && (
        <ul className="section-list">
          {document.sections.map((s) => (
            <li key={s.id}>
              <span>
                %{s.kind} @ {s.startTick}
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => onChange(removeSection(document, s.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="piano-scroll" onClick={onCanvasClick}>
        <div className="piano-grid" style={{ width, height }}>
          {Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, i) => {
            const pitch = PITCH_MAX - i;
            const black = [1, 3, 6, 8, 10].includes(pitch % 12);
            return (
              <div
                key={pitch}
                className={black ? "piano-row black" : "piano-row"}
                style={{ top: i * ROW_H, height: ROW_H }}
              />
            );
          })}
          {document.sections.map((s) => (
            <div
              key={s.id}
              className="section-marker"
              style={{ left: s.startTick * PX_PER_TICK }}
              title={`% ${s.kind}`}
            />
          ))}
          {(voice?.notes ?? []).map((n) => (
            <button
              type="button"
              key={n.id}
              className={
                n.id === selectedId ? "piano-note selected" : "piano-note"
              }
              style={{
                left: n.startTick * PX_PER_TICK,
                top: pitchToY(n.pitch),
                width: Math.max(6, n.durationTick * PX_PER_TICK),
                height: ROW_H - 2,
                opacity: 0.55 + (n.velocity / 127) * 0.45,
              }}
              onPointerDown={(e) =>
                onNotePointerDown(e, n.id, n.startTick, n.pitch)
              }
              onClick={(e) => e.stopPropagation()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
