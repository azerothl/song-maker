import { useEffect, useRef, useState, type FormEvent } from "react";
import { measurePlanarStemLevel } from "@song-maker/mix-production";
import { api } from "../../lib/api";
import {
  applyQwenAdjustments,
  filterApplicableQwenAdjustments,
  proposeQwenMix,
} from "../../lib/qwenMixAssistant";
import {
  audioSourceTracks,
  assistantStateFingerprint,
  detectStudioAssistantIntent,
  makePianoFollowVoice,
  makeRegularBeatVoice,
  placeTranscribedMelody,
  usableMelodyVoices,
  validateStudioAssistantMidiAction,
  withAssistantVoice,
  type StudioAssistantHistory,
  type StudioAssistantMessage,
  type StudioAssistantMidiAction,
  type StudioAssistantUndoRecord,
} from "../../lib/studioAssistant";
import { prepareMixRenderSources } from "../../lib/exportMix";
import { createEmptyScoreDocument, importMidiBytes, type ScoreDocument, type ScoreVoice } from "../../lib/score";
import type { MixDoc, MixTrack, PlaybackSources, ProjectDoc } from "../../lib/types";
import { profileLocale, t } from "../../ui/i18n";

type Props = {
  project: ProjectDoc;
  mix: MixDoc | null;
  sources: PlaybackSources | null;
  scoreDocument: ScoreDocument | null;
  tempoBpm: number;
  onBack: () => void;
  onPreviewMix: (mix: MixDoc | null) => void;
  onPreviewScore: (score: ScoreDocument | null) => void;
  onApplyMix: (mix: MixDoc) => Promise<MixDoc>;
  onApplyMidi: (mix: MixDoc, score: ScoreDocument, voice: ScoreVoice) => Promise<{ mix: MixDoc; score: ScoreDocument }>;
  onUndo: (record: StudioAssistantUndoRecord) => Promise<void>;
  onError: (message: string | null) => void;
};

type Proposal = { baseFingerprint: string } & (
  | { kind: "mix"; mix: MixDoc; explanation: string }
  | { kind: "midi"; mix: MixDoc; score: ScoreDocument; action: StudioAssistantMidiAction; explanation: string });

type SourceChoice =
  | { kind: "voice"; question: string; prompt: string; voices: ScoreVoice[]; tracks: MixTrack[] }
  | { kind: "audio"; question: string; prompt: string; tracks: MixTrack[] };

function newMessage(role: StudioAssistantMessage["role"], content: string): StudioAssistantMessage {
  return {
    id: `assistant-message-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function uniqueMidiTrackName(mix: MixDoc, prefix: string): string {
  const existing = new Set(mix.tracks.map((track) => track.name));
  if (!existing.has(prefix)) return prefix;
  let index = 2;
  while (existing.has(`${prefix} ${index}`)) index += 1;
  return `${prefix} ${index}`;
}

function midiMixTrack(voice: ScoreVoice): MixTrack {
  return {
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
    vst3Effects: [],
  };
}

export function StudioAssistantWorkspace({
  project,
  mix,
  sources,
  scoreDocument,
  tempoBpm,
  onBack,
  onPreviewMix,
  onPreviewScore,
  onApplyMix,
  onApplyMidi,
  onUndo,
  onError,
}: Props) {
  const [messages, setMessages] = useState<StudioAssistantMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [undoRecords, setUndoRecords] = useState<StudioAssistantUndoRecord[]>([]);
  const undoRecord = undoRecords.at(-1);
  const historyWriteRef = useRef<Promise<void>>(Promise.resolve());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const projectId = project.id;

  useEffect(() => {
    let current = true;
    setHistoryLoaded(false);
    setHistoryError(false);
    setMessages([]);
    setInput("");
    setProposal(null);
    setSourceChoice(null);
    setUndoRecords([]);
    onPreviewMix(null);
    onPreviewScore(null);
    void api.loadStudioAssistantHistory(projectId)
      .then((history) => {
        if (!current) return;
        setMessages(history.messages.slice(-200));
        setUndoRecords((history.undoRecords ?? []).slice(-20).map(record => record.afterMix
          ? { beforeMix: record.beforeMix, beforeScore: record.beforeScore, addedMidiTrackId: record.addedMidiTrackId,
            afterFingerprint: assistantStateFingerprint(record.afterMix, record.afterScore ?? null) }
          : record));
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!current) return;
        setHistoryError(true);
        setMessages([]);
        // Do not overwrite an unreadable history with an empty conversation.
      });
    return () => { current = false; onPreviewMix(null); onPreviewScore(null); };
  }, [onPreviewMix, onPreviewScore, projectId]);

  useEffect(() => {
    if (!historyLoaded) return;
    const history: StudioAssistantHistory = { messages: messages.slice(-200), undoRecords };
    historyWriteRef.current = historyWriteRef.current.catch(() => undefined)
      .then(() => api.saveStudioAssistantHistory(projectId, history));
    void historyWriteRef.current.catch(() => setHistoryError(true));
  }, [historyLoaded, messages, undoRecords, projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, proposal, sourceChoice]);

  const appendMessage = (role: StudioAssistantMessage["role"], content: string) => {
    setMessages((existing) => [...existing, newMessage(role, content)].slice(-200));
  };

  const proposeMidi = (
    text: string,
    sourceVoice: ScoreVoice,
    sourceScore: ScoreDocument,
    sourceVoiceId?: string,
    sourceTrackId?: string,
  ) => {
    if (!mix) {
      appendMessage("assistant", t("studio.assistant.noChanges"));
      return;
    }
    const name = uniqueMidiTrackName(mix, t("studio.assistant.pianoName"));
    const voice = makePianoFollowVoice(sourceVoice, name);
    const action: StudioAssistantMidiAction = {
      type: "addMidiTrack",
      voice,
      ...(sourceVoiceId ? { sourceVoiceId } : {}),
      ...(sourceTrackId ? { sourceTrackId } : {}),
    };
    try {
      validateStudioAssistantMidiAction(action, mix);
      const nextScore = withAssistantVoice(sourceScore, voice);
      const nextMix = { ...mix, tracks: [...mix.tracks, midiMixTrack(voice)] };
      const next: Proposal = {
        baseFingerprint: assistantStateFingerprint(mix, scoreDocument),
        kind: "midi",
        mix: nextMix,
        score: nextScore,
        action,
        explanation: text,
      };
      setProposal(next);
      setSourceChoice(null);
      onPreviewMix(nextMix);
      onPreviewScore(nextScore);
      appendMessage("assistant", t("studio.assistant.pianoPreview"));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const preparePiano = (text: string, sourceVoice: ScoreVoice, sourceTrackId?: string) => {
    const base = scoreDocument ?? createEmptyScoreDocument({
      tempoBpm,
      branchName: "assistant",
    });
    proposeMidi(text, sourceVoice, base, sourceVoice.id, sourceTrackId);
  };

  const transcribeSourceAndPreparePiano = async (text: string, track: MixTrack) => {
    if (busy) return;
    setBusy(true);
    setSourceChoice(null);
    try {
      const transcription = await api.transcribeBasicpitch(projectId, track.id);
      const imported = importMidiBytes(Uint8Array.from(transcription.midiBytes));
      const source = imported.document.voices.find((voice) => voice.notes.length > 0);
      if (!source) {
        appendMessage("assistant", t("studio.assistant.noChanges"));
        return;
      }
      const base = scoreDocument ?? createEmptyScoreDocument({ tempoBpm, branchName: "assistant" });
      const sourceVoice: ScoreVoice = {
        ...placeTranscribedMelody(source, imported.document, base, track),
        id: `assistant-source-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        name: `Mélodie transcrite — ${track.name}`,
        role: "melody",
        instrumentProgram: undefined,
      };
      // Transcription is a reference, not a second audible arrangement lane.
      proposeMidi(text, sourceVoice, base, undefined, track.id);
    } catch (error) {
      appendMessage("assistant", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const proposeMix = async (text: string) => {
    if (!mix) {
      appendMessage("assistant", t("studio.assistant.noChanges"));
      return;
    }
    const { stems } = await prepareMixRenderSources(mix, sources, scoreDocument);
    const summaries = mix.tracks.map((track) => {
      const stem = stems.find((candidate) => candidate.trackId === track.id);
      const level = measurePlanarStemLevel(
        track.id,
        track.role,
        stem?.left ?? new Float32Array(0),
        stem?.right ?? new Float32Array(0),
      );
      return {
        id: track.id,
        name: track.name,
        role: track.role,
        gainDb: track.gainDb,
        pan: track.pan,
        rmsDb: level.rmsDb,
        peakDb: level.peakDb,
      };
    });
    const response = await proposeQwenMix(summaries, text, profileLocale());
    const filtered = filterApplicableQwenAdjustments(mix, response.adjustments);
    if (!filtered.adjustments.length) {
      appendMessage("assistant", t("studio.assistant.noChanges"));
      return;
    }
    const nextMix = applyQwenAdjustments(mix, filtered.adjustments);
    setProposal({ kind: "mix", mix: nextMix, explanation: response.explanation,
      baseFingerprint: assistantStateFingerprint(mix, scoreDocument) });
    onPreviewMix(nextMix);
    onPreviewScore(scoreDocument);
    appendMessage("assistant", response.explanation || t("studio.assistant.mixPreview"));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !historyLoaded) return;
    setInput("");
    setProposal(null);
    setSourceChoice(null);
    onPreviewMix(null);
    onPreviewScore(null);
    appendMessage("user", text);
    const intent = detectStudioAssistantIntent(text);
    setBusy(true);
    try {
      if (intent === "beat") {
        if (!mix) throw new Error(t("studio.assistant.noChanges"));
        const name = uniqueMidiTrackName(mix, t("studio.assistant.beatName"));
        const voice = makeRegularBeatVoice(name, scoreDocument?.timeSignatures[0] ?? { numerator: 4, denominator: 4 });
        const action: StudioAssistantMidiAction = { type: "addMidiTrack", voice };
        validateStudioAssistantMidiAction(action, mix);
        const base = scoreDocument ?? createEmptyScoreDocument({ tempoBpm, branchName: "assistant" });
        const nextScore = withAssistantVoice(base, voice);
        const nextMix = { ...mix, tracks: [...mix.tracks, midiMixTrack(voice)] };
        setProposal({ kind: "midi", mix: nextMix, score: nextScore, action, explanation: text,
          baseFingerprint: assistantStateFingerprint(mix, scoreDocument) });
        onPreviewMix(nextMix);
        onPreviewScore(nextScore);
        appendMessage("assistant", t("studio.assistant.beatPreview"));
      } else if (intent === "piano") {
        const voices = usableMelodyVoices(scoreDocument);
        const tracks = mix ? audioSourceTracks(mix) : [];
        if (voices.length === 1 && scoreDocument && !tracks.length) {
          preparePiano(text, voices[0], undefined);
        } else if (voices.length > 0) {
          setSourceChoice({ kind: "voice", question: t("studio.assistant.chooseMelody"), prompt: text, voices, tracks });
          setSelectedSourceId("");
          appendMessage("assistant", t("studio.assistant.chooseMelody"));
        } else {
          if (!tracks.length) {
            appendMessage("assistant", t("studio.assistant.noAudioSource"));
          } else {
            setSourceChoice({ kind: "audio", question: t("studio.assistant.chooseAudio"), prompt: text, tracks });
            setSelectedSourceId(tracks.length === 1 ? tracks[0].id : "");
            appendMessage("assistant", t("studio.assistant.chooseAudio"));
          }
        }
      } else if (intent === "mix") {
        await proposeMix(text);
      } else {
        appendMessage("assistant", t("studio.assistant.unknown"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendMessage("assistant", message);
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = async () => {
    if (!proposal || busy || !mix) return;
    setBusy(true);
    onError(null);
    try {
      if (proposal.baseFingerprint !== assistantStateFingerprint(mix, scoreDocument)) {
        throw new Error(t("studio.assistant.staleProposal"));
      }
      await historyWriteRef.current;
      const applied = proposal.kind === "mix"
        ? { mix: await onApplyMix(proposal.mix), score: scoreDocument }
        : await onApplyMidi(proposal.mix, proposal.score, proposal.action.voice);
      setUndoRecords(records => [...records, {
        beforeMix: mix, beforeScore: scoreDocument,
        ...(proposal.kind === "midi" ? { addedMidiTrackId: proposal.action.voice.id } : {}),
        afterFingerprint: assistantStateFingerprint(applied.mix, applied.score),
      }].slice(-20));
      setProposal(null);
      onPreviewMix(null);
      onPreviewScore(null);
      appendMessage("assistant", t("studio.assistant.apply"));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!undoRecord || busy) return;
    setBusy(true);
    onError(null);
    try {
      if (undoRecord.afterFingerprint !== assistantStateFingerprint(mix, scoreDocument)) {
        throw new Error(t("studio.assistant.staleUndo"));
      }
      await onUndo(undoRecord);
      setUndoRecords(records => records.slice(0, -1));
      appendMessage("assistant", t("studio.assistant.undo"));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const clearProposal = () => {
    setProposal(null);
    setSourceChoice(null);
    onPreviewMix(null);
    onPreviewScore(null);
  };

  return (
    <section className="studio-assistant-workspace" aria-labelledby="studio-assistant-title">
      <header className="studio-assistant-header">
        <div>
          <p className="studio-assistant-eyebrow">{t("nav.studio")}</p>
          <h2 id="studio-assistant-title">{t("studio.assistant.title")}</h2>
          <p>{t("studio.assistant.welcome")}</p>
        </div>
        <div className="studio-assistant-header-actions">
          {undoRecord && <button className="btn" type="button" disabled={busy} onClick={() => void undo()}>{t("studio.assistant.undo")}</button>}
          <button className="btn ghost" type="button" disabled={busy} onClick={() => {
            void historyWriteRef.current.then(onBack).catch(() => setHistoryError(true));
          }}>{t("studio.assistant.back")}</button>
        </div>
      </header>

      <p className="studio-assistant-local hint">{t("studio.assistant.local")}</p>
      {historyError && <p className="hint" role="status">{t("studio.assistant.historyUnavailable")}</p>}

      <div className="studio-assistant-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => (
          <article key={message.id} className={`studio-assistant-message is-${message.role}`}>
            <span className="studio-assistant-message-role">{message.role === "user" ? t("studio.assistant.input") : t("studio.assistant.title")}</span>
            <p>{message.content}</p>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {sourceChoice && (
        <section className="studio-assistant-source" aria-label={sourceChoice.question}>
          <p>{sourceChoice.question}</p>
          <label>
            {sourceChoice.kind === "voice" ? t("studio.assistant.chooseMelody") : t("studio.assistant.chooseAudio")}
            <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
              <option value="">—</option>
              {sourceChoice.kind === "voice"
                ? sourceChoice.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)
                : sourceChoice.tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              {sourceChoice.kind === "voice" && sourceChoice.tracks.map(track =>
                <option key={`audio-${track.id}`} value={`audio:${track.id}`}>Audio — {track.name}</option>)}
            </select>
          </label>
          <button
            className="btn"
            type="button"
            disabled={!selectedSourceId || busy}
            onClick={() => {
              if (sourceChoice.kind === "voice") {
                if (selectedSourceId.startsWith("audio:")) {
                  const track = sourceChoice.tracks.find(track => track.id === selectedSourceId.slice(6));
                  if (track) void transcribeSourceAndPreparePiano(sourceChoice.prompt, track);
                  return;
                }
                const voice = sourceChoice.voices.find((item) => item.id === selectedSourceId);
                if (voice) preparePiano(sourceChoice.prompt, voice, voice.id);
              } else {
                const track = sourceChoice.tracks.find((item) => item.id === selectedSourceId);
                if (track) void transcribeSourceAndPreparePiano(sourceChoice.prompt, track);
              }
            }}
          >
            {sourceChoice.kind === "voice" && !selectedSourceId.startsWith("audio:") ? t("studio.assistant.send") : t(busy ? "studio.assistant.transcribing" : "studio.assistant.transcribe")}
          </button>
        </section>
      )}

      {proposal && (
        <section className="studio-assistant-proposal" aria-labelledby="studio-assistant-preview-title">
          <div className="studio-assistant-proposal-copy">
            <span className="studio-assistant-proposal-badge">{t("studio.assistant.preview")}</span>
            <h3 id="studio-assistant-preview-title">{proposal.kind === "midi" ? proposal.action.voice.name : t("studio.assistant.preview")}</h3>
            <p>{proposal.kind === "midi"
              ? proposal.action.voice.instrumentProgram === "drums"
                ? t("studio.assistant.beatPreview")
                : t("studio.assistant.pianoPreview")
              : proposal.explanation || t("studio.assistant.mixPreview")}</p>
            {proposal.kind === "midi" && <p className="hint">{t("studio.assistant.midiContext", {
              count: proposal.action.voice.notes.length,
              bpm: proposal.score.tempoMap[0]?.quarterBpm ?? tempoBpm,
              meter: `${proposal.score.timeSignatures[0]?.numerator ?? 4}/${proposal.score.timeSignatures[0]?.denominator ?? 4}`,
              source: proposal.action.sourceVoiceId
                ? scoreDocument?.voices.find(voice => voice.id === proposal.action.sourceVoiceId)?.name ?? "—"
                : proposal.action.sourceTrackId ? mix?.tracks.find(track => track.id === proposal.action.sourceTrackId)?.name ?? "—"
                : t("studio.assistant.beatName"),
            })}</p>}
          </div>
          <div className="studio-assistant-proposal-actions">
            <button className="btn primary" type="button" disabled={busy} onClick={() => void applyProposal()}>{t("studio.assistant.apply")}</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={clearProposal}>{t("studio.assistant.cancel")}</button>
          </div>
        </section>
      )}

      <form className="studio-assistant-composer" onSubmit={(event) => void submit(event)}>
        <label htmlFor="studio-assistant-input">{t("studio.assistant.input")}</label>
        <textarea
          id="studio-assistant-input"
          maxLength={1000}
          rows={3}
          value={input}
          disabled={busy || !historyLoaded}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("studio.assistant.welcome")}
        />
        <div className="studio-assistant-composer-footer">
          <span className="hint">{input.length}/1000</span>
          <button className="btn primary" type="submit" disabled={busy || !historyLoaded || !input.trim()}>{t(busy ? "studio.assistant.busy" : "studio.assistant.send")}</button>
        </div>
      </form>
    </section>
  );
}
