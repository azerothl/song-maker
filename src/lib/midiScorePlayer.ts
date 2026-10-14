import type { ScoreDocument } from "@song-maker/score-engine";
import type { SoftSynth } from "./midiInstrument";
import { scoreSecondsToTicks, scoreTicksToSeconds } from "./scoreTiming";

export type ScorePlaybackHandle = {
  stop: () => void;
  playing: boolean;
};

/**
 * Schedule ScoreDocument notes on a SoftSynth. Does not replace symbolic data.
 */
export function playScoreDocument(
  synth: SoftSynth,
  document: ScoreDocument,
  options?: {
    voiceId?: string | null;
    onEnded?: () => void;
    startSeconds?: number;
    endSeconds?: number;
    loop?: boolean;
  },
): ScorePlaybackHandle {
  let stopped = false;
  const timers = new Set<number>();
  const active = new Map<number, string>();
  const voice =
    (options?.voiceId
      ? document.voices.find((v) => v.id === options.voiceId)
      : null) ?? document.voices[0];
  if (!voice) {
    options?.onEnded?.();
    return { stop: () => undefined, playing: false };
  }

  void (async () => {
    await synth.ensureContext();
    const ctx = synth.getContext();
    if (!ctx || stopped) {
      options?.onEnded?.();
      return;
    }
    const first = Math.max(0, options?.startSeconds ?? 0);
    const lastNote = voice.notes.reduce((end, note) => Math.max(end,
      scoreTicksToSeconds(document, note.startTick + note.durationTick)), first);
    const last = Math.max(first + 0.05, options?.endSeconds ?? lastNote);
    function schedule(callback: () => void, milliseconds: number) {
      const timer = window.setTimeout(() => { timers.delete(timer); if (!stopped) callback(); }, Math.max(0, milliseconds));
      timers.add(timer);
    }
    function cycle() {
      if (stopped) return;
      const t0 = ctx!.currentTime + synth.getLatencyMs() / 1000;
      for (const note of voice!.notes) {
        const start = Math.max(first, scoreTicksToSeconds(document, note.startTick));
        const end = Math.min(last, scoreTicksToSeconds(document, note.startTick + note.durationTick));
        if (end <= start) continue;
        const when = t0 + start - first;
        const off = t0 + end - first;
        // Create voices near their onset, so an earlier note-off cannot stop a
        // later already-scheduled note of the same pitch.
        schedule(() => {
          active.set(note.pitch, note.id);
          void synth.noteOn(note.pitch, note.velocity, Math.max(ctx!.currentTime, when));
        }, (when - ctx!.currentTime) * 1000 - 10);
        schedule(() => {
          if (active.get(note.pitch) === note.id) {
            synth.noteOff(note.pitch, ctx!.currentTime);
            active.delete(note.pitch);
          }
        }, (off - ctx!.currentTime) * 1000);
      }
      schedule(() => {
        synth.allNotesOff();
        active.clear();
        if (options?.loop) cycle();
        else options?.onEnded?.();
      }, (t0 + last - first - ctx!.currentTime) * 1000 + (options?.loop ? 0 : 150));
    }
    cycle();
  })();

  return {
    playing: true,
    stop: () => {
      stopped = true;
      for (const tid of timers) window.clearTimeout(tid);
      synth.allNotesOff();
      options?.onEnded?.();
    },
  };
}

/** Quantize absolute seconds to nearest tick grid. */
export function quantizeSecondsToTick(
  seconds: number,
  document: ScoreDocument,
  quantizeTicks: number,
): number {
  const ticks = scoreSecondsToTicks(document, seconds);
  if (quantizeTicks <= 0) return ticks;
  return Math.round(ticks / quantizeTicks) * quantizeTicks;
}
