import { useEffect, useMemo, useRef, useState } from "react";
import {
  listMidiInputs,
  requestMidiAccess,
  subscribeMidiInput,
  type MidiInputDevice,
} from "../lib/midiInput";
import {
  INSTRUMENT_PROGRAMS,
  SoftSynth,
  type InstrumentProgram,
} from "../lib/midiInstrument";
import {
  playScoreDocument,
  quantizeSecondsToTick,
  type ScorePlaybackHandle,
} from "../lib/midiScorePlayer";
import { addNote, type ScoreDocument } from "../lib/score";
import { t } from "../ui/i18n";

const DEFAULT_NOTE_TICKS = 240;
const QUANTIZE_TICKS = 120;

type Props = {
  document: ScoreDocument;
  voiceId?: string | null;
  onDocumentChange: (doc: ScoreDocument) => void;
  latencyMs: number;
  onLatencyChange?: (ms: number) => void;
  onError?: (msg: string | null) => void;
};

function programLabel(program: InstrumentProgram): string {
  switch (program) {
    case "piano":
      return t("midi.program.piano");
    case "epiano":
      return t("midi.program.epiano");
    case "organ":
      return t("midi.program.organ");
    case "bass":
      return t("midi.program.bass");
    case "strings":
      return t("midi.program.strings");
    case "lead":
      return t("midi.program.lead");
    case "pad":
      return t("midi.program.pad");
    case "pluck":
      return t("midi.program.pluck");
    default: {
      const _exhaustive: never = program;
      return _exhaustive;
    }
  }
}

function newNoteId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function MidiInstrumentPanel({
  document,
  voiceId,
  onDocumentChange,
  latencyMs,
  onLatencyChange,
  onError,
}: Props) {
  const synthRef = useRef<SoftSynth | null>(null);
  const playbackRef = useRef<ScorePlaybackHandle | null>(null);
  const recordStartRef = useRef<number | null>(null);
  const activeNotesRef = useRef(
    new Map<number, { startTick: number; velocity: number }>(),
  );
  const docRef = useRef(document);
  const onChangeRef = useRef(onDocumentChange);
  docRef.current = document;
  onChangeRef.current = onDocumentChange;

  const [program, setProgram] = useState<InstrumentProgram>("piano");
  const [gainDb, setGainDb] = useState(0);
  const [mute, setMute] = useState(false);
  const [solo, setSolo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [devices, setDevices] = useState<MidiInputDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [quantize, setQuantize] = useState(true);
  const [monitorInput, setMonitorInput] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const recordingRef = useRef(recording);
  const quantizeRef = useRef(quantize);
  const monitorRef = useRef(monitorInput);
  recordingRef.current = recording;
  quantizeRef.current = quantize;
  monitorRef.current = monitorInput;

  const resolvedVoiceId = useMemo(
    () => voiceId ?? document.voices[0]?.id ?? null,
    [voiceId, document.voices],
  );
  const voiceIdRef = useRef(resolvedVoiceId);
  voiceIdRef.current = resolvedVoiceId;

  useEffect(() => {
    const synth = new SoftSynth({ latencySec: latencyMs / 1000 });
    synthRef.current = synth;
    return () => {
      playbackRef.current?.stop();
      void synth.dispose();
      synthRef.current = null;
    };
    // Intentionally once — latency applied via setLatencyMs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    synthRef.current?.setLatencyMs(latencyMs);
  }, [latencyMs]);

  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.setProgram(program);
    synth.setGainDb(gainDb);
    synth.setMute(mute);
    synth.setSolo(solo);
    synth.setSoloGate(true);
  }, [program, gainDb, mute, solo]);

  useEffect(() => {
    let cancelled = false;
    let access: Awaited<ReturnType<typeof requestMidiAccess>> = null;

    void (async () => {
      access = await requestMidiAccess();
      if (cancelled) return;
      if (!access) {
        setMidiSupported(false);
        setDevices([]);
        return;
      }
      setMidiSupported(true);
      const refresh = () => {
        const list = listMidiInputs(access);
        setDevices(list);
        setDeviceId((prev) =>
          prev && list.some((d) => d.id === prev)
            ? prev
            : (list[0]?.id ?? null),
        );
      };
      refresh();
      access.onstatechange = () => refresh();
    })();

    return () => {
      cancelled = true;
      if (access) access.onstatechange = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sub: { disconnect: () => void } | null = null;

    void (async () => {
      const access = await requestMidiAccess();
      if (cancelled || !access || !deviceId) return;
      sub = subscribeMidiInput(access, deviceId, (msg) => {
        const synth = synthRef.current;
        if (!synth) return;
        const doc = docRef.current;
        const vId = voiceIdRef.current;

        if (msg.type === "noteon") {
          if (monitorRef.current || recordingRef.current) {
            void synth.noteOn(msg.pitch, msg.velocity);
          }
          if (recordingRef.current && recordStartRef.current != null && vId) {
            const elapsed =
              (performance.now() - recordStartRef.current) / 1000;
            const grid = quantizeRef.current ? QUANTIZE_TICKS : 1;
            const tick = quantizeSecondsToTick(elapsed, doc, grid);
            activeNotesRef.current.set(msg.pitch, {
              startTick: tick,
              velocity: msg.velocity,
            });
          }
          return;
        }

        synth.noteOff(msg.pitch);
        if (!recordingRef.current || !vId) return;
        const active = activeNotesRef.current.get(msg.pitch);
        if (!active) return;
        activeNotesRef.current.delete(msg.pitch);
        const elapsed =
          recordStartRef.current != null
            ? (performance.now() - recordStartRef.current) / 1000
            : 0;
        const grid = quantizeRef.current ? QUANTIZE_TICKS : 1;
        const endTick = quantizeSecondsToTick(elapsed, doc, grid);
        const durationTick = Math.max(
          DEFAULT_NOTE_TICKS,
          endTick - active.startTick,
        );
        const next = addNote(docRef.current, vId, {
          id: newNoteId(),
          startTick: active.startTick,
          durationTick,
          pitch: msg.pitch,
          velocity: active.velocity,
        });
        docRef.current = next;
        onChangeRef.current(next);
      });
    })();

    return () => {
      cancelled = true;
      sub?.disconnect();
    };
  }, [deviceId]);

  function stopPlayback() {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setPlaying(false);
  }

  function onPlay() {
    onError?.(null);
    const synth = synthRef.current;
    if (!synth) return;
    stopPlayback();
    setPlaying(true);
    setStatus(t("midi.playing"));
    playbackRef.current = playScoreDocument(synth, document, {
      voiceId: resolvedVoiceId,
      onEnded: () => {
        setPlaying(false);
        setStatus(null);
        playbackRef.current = null;
      },
    });
  }

  function onStop() {
    stopPlayback();
    synthRef.current?.allNotesOff();
    setStatus(null);
  }

  function startRecord() {
    onError?.(null);
    activeNotesRef.current.clear();
    recordStartRef.current = performance.now();
    setRecording(true);
    setStatus(t("midi.recording"));
  }

  function stopRecord() {
    const vId = voiceIdRef.current;
    if (vId) {
      let doc = docRef.current;
      const elapsed =
        recordStartRef.current != null
          ? (performance.now() - recordStartRef.current) / 1000
          : 0;
      const grid = quantizeRef.current ? QUANTIZE_TICKS : 1;
      let changed = false;
      for (const [pitch, active] of activeNotesRef.current) {
        const endTick = quantizeSecondsToTick(elapsed, doc, grid);
        const durationTick = Math.max(
          DEFAULT_NOTE_TICKS,
          endTick - active.startTick,
        );
        doc = addNote(doc, vId, {
          id: newNoteId(),
          startTick: active.startTick,
          durationTick,
          pitch,
          velocity: active.velocity,
        });
        synthRef.current?.noteOff(pitch);
        changed = true;
      }
      if (changed) {
        docRef.current = doc;
        onChangeRef.current(doc);
      }
    }
    activeNotesRef.current.clear();
    recordStartRef.current = null;
    setRecording(false);
    setStatus(t("midi.recordDone"));
  }

  async function auditionPitch(pitch: number) {
    const synth = synthRef.current;
    if (!synth) return;
    await synth.noteOn(pitch, 100);
    window.setTimeout(() => synth.noteOff(pitch), 220);
  }

  return (
    <div className="midi-instrument-panel">
      <div className="midi-instrument-header">
        <h4>{t("midi.title")}</h4>
        <span className="hint">{t("midi.hint")}</span>
      </div>

      <div className="midi-instrument-controls">
        <label>
          <span>{t("midi.program")}</span>
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value as InstrumentProgram)}
          >
            {INSTRUMENT_PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {programLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("midi.gain")}</span>
          <input
            type="range"
            min={-24}
            max={12}
            step={1}
            value={gainDb}
            onChange={(e) => setGainDb(Number(e.target.value))}
          />
          <span className="mono">{gainDb} dB</span>
        </label>
        <label className="clip-tool-check">
          <input
            type="checkbox"
            checked={mute}
            onChange={(e) => setMute(e.target.checked)}
          />
          <span>{t("midi.mute")}</span>
        </label>
        <label className="clip-tool-check">
          <input
            type="checkbox"
            checked={solo}
            onChange={(e) => setSolo(e.target.checked)}
          />
          <span>{t("midi.solo")}</span>
        </label>
        <label>
          <span>{t("midi.latency")}</span>
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={latencyMs}
            onChange={(e) => onLatencyChange?.(Number(e.target.value))}
          />
          <span className="hint">ms</span>
        </label>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn primary"
          disabled={
            playing || document.voices.every((v) => v.notes.length === 0)
          }
          onClick={onPlay}
        >
          {t("midi.play")}
        </button>
        <button type="button" className="btn" onClick={onStop}>
          {t("midi.stop")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void auditionPitch(60)}
        >
          {t("midi.audition")}
        </button>
      </div>

      <div className="midi-record-block">
        <label>
          <span>{t("midi.device")}</span>
          <select
            value={deviceId ?? ""}
            disabled={!midiSupported || devices.length === 0}
            onChange={(e) => setDeviceId(e.target.value || null)}
          >
            {devices.length === 0 && (
              <option value="">{t("midi.device.empty")}</option>
            )}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {!midiSupported && <p className="hint">{t("midi.unsupported")}</p>}
        <label className="clip-tool-check">
          <input
            type="checkbox"
            checked={quantize}
            onChange={(e) => setQuantize(e.target.checked)}
          />
          <span>{t("midi.quantize")}</span>
        </label>
        <label className="clip-tool-check">
          <input
            type="checkbox"
            checked={monitorInput}
            onChange={(e) => setMonitorInput(e.target.checked)}
          />
          <span>{t("midi.monitor")}</span>
        </label>
        <div className="btn-row">
          {!recording ? (
            <button
              type="button"
              className="btn"
              disabled={!midiSupported || !deviceId}
              onClick={startRecord}
            >
              {t("midi.record")}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={stopRecord}>
              {t("midi.recordStop")}
            </button>
          )}
        </div>
        <p className="hint">{t("midi.recordHint")}</p>
      </div>

      {status && <p className="hint">{status}</p>}
    </div>
  );
}
