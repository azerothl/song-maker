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
  },
): ScorePlaybackHandle {
  let stopped = false;
  const timers: number[] = [];
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
    const t0 = ctx.currentTime + synth.getLatencyMs() / 1000;
    let maxEnd = 0;
    for (const note of voice.notes) {
      const startSec = scoreTicksToSeconds(document, note.startTick);
      const durSec = Math.max(
        0.04,
        scoreTicksToSeconds(document, note.durationTick),
      );
      const when = t0 + startSec;
      const off = when + durSec;
      maxEnd = Math.max(maxEnd, off);
      void synth.noteOn(note.pitch, note.velocity, when);
      const tid = window.setTimeout(
        () => {
          if (!stopped) synth.noteOff(note.pitch, ctx.currentTime);
        },
        Math.max(0, (off - ctx.currentTime) * 1000),
      );
      timers.push(tid);
    }
    const endTid = window.setTimeout(
      () => {
        if (!stopped) options?.onEnded?.();
      },
      Math.max(0, (maxEnd - ctx.currentTime) * 1000 + 50),
    );
    timers.push(endTid);
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
