import { useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import type { ScoreDocument, SectionKind } from "../lib/score";
import {
  addNote,
  deleteNote,
  primaryVoiceId,
  removeSection,
  updateNote,
  updateScoreTempo,
  upsertSection,
} from "../lib/score";
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

const PITCH_MIN = 48;
const PITCH_MAX = 84;
const PX_PER_TICK = 0.04;
const ROW_H = 14;

type Props = {
  document: ScoreDocument;
  onChange: (doc: ScoreDocument) => void;
};

export function PianoRoll({ document, onChange }: Props) {
  const voiceId = primaryVoiceId(document);
  const voice = document.voices.find((v) => v.id === voiceId) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionKind, setSectionKind] = useState<SectionKind>("verse");
  const tempo = document.tempoMap[0]?.quarterBpm ?? 120;

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

  return (
    <div className="piano-roll">
      <div className="piano-toolbar">
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
        <span className="hint">{t("score.pianoHint")}</span>
      </div>

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
