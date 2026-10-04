/**
 * Built-in offline software instrument (Web Audio).
 * Oscillators by default; optional user-selected SF2 (#329).
 */

import { pickSf2Zone, type Sf2Bank } from "./sf2Bank";

export type InstrumentProgram =
  | "piano"
  | "epiano"
  | "organ"
  | "bass"
  | "strings"
  | "lead"
  | "pad"
  | "pluck";

export const INSTRUMENT_PROGRAMS: InstrumentProgram[] = [
  "piano",
  "epiano",
  "organ",
  "bass",
  "strings",
  "lead",
  "pad",
  "pluck",
];

export type SoftSynthOptions = {
  /** Lookahead / scheduling latency in seconds. */
  latencySec?: number;
};

type Voice = {
  osc: OscillatorNode[];
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  filter: BiquadFilterNode | null;
};

function midiToHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

function programWave(program: InstrumentProgram): OscillatorType {
  switch (program) {
    case "piano":
    case "epiano":
    case "pluck":
      return "triangle";
    case "organ":
    case "pad":
      return "sine";
    case "bass":
    case "lead":
      return "sawtooth";
    case "strings":
      return "square";
    default: {
      const _exhaustive: never = program;
      return _exhaustive;
    }
  }
}

function programFilterHz(program: InstrumentProgram, pitch: number): number {
  const base = midiToHz(pitch);
  switch (program) {
    case "bass":
      return Math.min(2400, base * 4);
    case "pad":
    case "strings":
      return Math.min(5000, base * 6);
    case "lead":
      return Math.min(8000, base * 8);
    default:
      return Math.min(6000, base * 5);
  }
}

export class SoftSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<number, Voice>();
  private program: InstrumentProgram = "piano";
  private gainDb = 0;
  private muted = false;
  private soloed = false;
  /** When any track is soloed elsewhere, callers set this. */
  private soloGate = true;
  private latencySec: number;
  private sf2: Sf2Bank | null = null;
  private sf2Preset = 0;

  constructor(options?: SoftSynthOptions) {
    this.latencySec = Math.max(0, options?.latencySec ?? 0.02);
  }

  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getCurrentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setLatencyMs(ms: number) {
    this.latencySec = Math.max(0, ms / 1000);
  }

  getLatencyMs(): number {
    return Math.round(this.latencySec * 1000);
  }

  setProgram(program: InstrumentProgram) {
    this.program = program;
  }

  getProgram(): InstrumentProgram {
    return this.program;
  }

  setSf2Bank(bank: Sf2Bank | null) {
    this.sf2 = bank;
    this.sf2Preset = 0;
  }

  getSf2Bank(): Sf2Bank | null {
    return this.sf2;
  }

  setSf2Preset(index: number) {
    if (!this.sf2) {
      this.sf2Preset = 0;
      return;
    }
    this.sf2Preset = Math.max(0, Math.min(this.sf2.presets.length - 1, index));
  }

  getSf2Preset(): number {
    return this.sf2Preset;
  }

  usesSf2(): boolean {
    return this.sf2 != null;
  }

  setGainDb(db: number) {
    this.gainDb = db;
    if (this.master) {
      this.master.gain.value = this.effectiveGain();
    }
  }

  getGainDb(): number {
    return this.gainDb;
  }

  setMute(mute: boolean) {
    this.muted = mute;
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setSolo(solo: boolean) {
    this.soloed = solo;
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  isSolo(): boolean {
    return this.soloed;
  }

  /** When false, instrument is silenced unless soloed (mix-style solo gate). */
  setSoloGate(open: boolean) {
    this.soloGate = open;
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  private effectiveGain(): number {
    if (this.muted) return 0;
    if (!this.soloGate && !this.soloed) return 0;
    return dbToLinear(this.gainDb);
  }

  async noteOn(
    pitch: number,
    velocity = 100,
    when?: number,
  ): Promise<void> {
    const ctx = await this.ensureContext();
    if (!this.master) return;
    const p = Math.max(0, Math.min(127, Math.round(pitch)));
    this.noteOff(p, when);
    const t = when ?? ctx.currentTime + this.latencySec;
    const vel = Math.max(1, Math.min(127, velocity)) / 127;
    const zone = this.sf2 ? pickSf2Zone(this.sf2, this.sf2Preset, p) : null;
    if (zone && zone.sample.length > 0) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35 * vel, t + 0.01);
      const source = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, zone.sample.length, zone.sampleRate);
      buf.getChannelData(0).set(zone.sample);
      source.buffer = buf;
      source.playbackRate.value = 2 ** ((p - zone.rootKey) / 12);
      if (zone.loop && zone.loopEnd > zone.loopStart + 8) {
        source.loop = true;
        source.loopStart = zone.loopStart / zone.sampleRate;
        source.loopEnd = zone.loopEnd / zone.sampleRate;
      }
      source.connect(gain);
      gain.connect(this.master);
      source.start(t);
      this.voices.set(p, { osc: [], source, gain, filter: null });
      return;
    }
    const wave = programWave(this.program);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = programFilterHz(this.program, p);
    filter.Q.value = this.program === "lead" ? 4 : 1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.01);
    if (this.program === "pluck" || this.program === "piano") {
      gain.gain.exponentialRampToValueAtTime(0.08 * vel, t + 0.35);
    }
    const oscs: OscillatorNode[] = [];
    const freqs =
      this.program === "organ"
        ? [midiToHz(p), midiToHz(p) * 2, midiToHz(p) * 3]
        : this.program === "strings"
          ? [midiToHz(p), midiToHz(p) * 1.002]
          : [midiToHz(p)];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(f, t);
      osc.connect(filter);
      osc.start(t);
      oscs.push(osc);
    }
    filter.connect(gain);
    gain.connect(this.master);
    this.voices.set(p, { osc: oscs, source: null, gain, filter });
  }

  noteOff(pitch: number, when?: number) {
    const p = Math.max(0, Math.min(127, Math.round(pitch)));
    const voice = this.voices.get(p);
    if (!voice || !this.ctx) return;
    const t = when ?? this.ctx.currentTime + 0.005;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      for (const osc of voice.osc) {
        osc.stop(t + 0.14);
      }
      try {
        voice.source?.stop(t + 0.14);
      } catch {
        /* already stopped */
      }
    } catch {
      /* already stopped */
    }
    this.voices.delete(p);
  }

  allNotesOff() {
    for (const pitch of [...this.voices.keys()]) {
      this.noteOff(pitch);
    }
  }

  async dispose() {
    this.allNotesOff();
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
    this.master = null;
  }
}
