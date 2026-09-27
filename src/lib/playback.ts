import { convertFileSrc } from "@tauri-apps/api/core";
import type { MixDoc, PlaybackSources } from "./types";

export type TrackPeaks = {
  trackId: string;
  name: string;
  role: string;
  peaks: Float32Array;
};

export type PlaybackSnapshot = {
  current: number;
  duration: number;
  playing: boolean;
  ready: boolean;
  loading: boolean;
  label: string;
  mode: "generation" | "stems" | "empty";
  peaks: TrackPeaks[];
  mixPeaks: Float32Array | null;
};

type TrackNodes = {
  trackId: string;
  buffer: AudioBuffer;
  gain: GainNode;
  pan: StereoPannerNode;
};

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

function extractPeaks(buffer: AudioBuffer, buckets = 600): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const peaks = new Float32Array(buckets);
  const block = Math.max(1, Math.floor(length / buckets));
  for (let i = 0; i < buckets; i++) {
    const start = i * block;
    const end = Math.min(length, start + block);
    let max = 0;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let j = start; j < end; j++) {
        const v = Math.abs(data[j] ?? 0);
        if (v > max) max = v;
      }
    }
    peaks[i] = max;
  }
  return peaks;
}

function sumPeaks(tracks: TrackPeaks[], buckets = 600): Float32Array {
  const out = new Float32Array(buckets);
  for (const t of tracks) {
    for (let i = 0; i < buckets; i++) {
      out[i] = Math.min(1, out[i] + (t.peaks[i] ?? 0));
    }
  }
  return out;
}

async function fetchDecode(
  ctx: AudioContext,
  absolutePath: string,
): Promise<AudioBuffer> {
  const url = convertFileSrc(absolutePath);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Lecture audio impossible (${resp.status}).`);
  }
  const bytes = await resp.arrayBuffer();
  return ctx.decodeAudioData(bytes.slice(0));
}

export class MixPlaybackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ceiling: GainNode | null = null;
  private tracks: TrackNodes[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private generationBuffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private duration = 0;
  private loading = false;
  private ready = false;
  private label = "";
  private mode: PlaybackSnapshot["mode"] = "empty";
  private peaks: TrackPeaks[] = [];
  private mixPeaks: Float32Array | null = null;
  private listeners = new Set<() => void>();
  private raf = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      current: this.getCurrentTime(),
      duration: this.duration,
      playing: this.playing,
      ready: this.ready,
      loading: this.loading,
      label: this.label,
      mode: this.mode,
      peaks: this.peaks,
      mixPeaks: this.mixPeaks,
    };
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.playing) return this.offset;
    return Math.min(
      this.duration,
      this.offset + (this.ctx.currentTime - this.startedAt),
    );
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ceiling = this.ctx.createGain();
      this.ceiling.gain.value = 1;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.ceiling.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async load(sources: PlaybackSources | null, mix: MixDoc | null) {
    this.stopSources(false);
    this.tracks = [];
    this.generationBuffer = null;
    this.peaks = [];
    this.mixPeaks = null;
    this.ready = false;
    this.duration = 0;
    this.offset = 0;
    this.playing = false;
    this.stopRaf();

    if (!sources) {
      this.mode = "empty";
      this.label = "";
      this.loading = false;
      this.notify();
      return;
    }

    this.loading = true;
    this.label = sources.label;
    this.notify();

    try {
      const ctx = this.ensureCtx();
      if (sources.mode === "stems" && sources.stems.length > 0) {
        this.mode = "stems";
        const loaded: TrackNodes[] = [];
        const peaks: TrackPeaks[] = [];
        let maxDur = 0;
        for (const stem of sources.stems) {
          const buffer = await fetchDecode(ctx, stem.path);
          maxDur = Math.max(maxDur, buffer.duration);
          const gain = ctx.createGain();
          const pan = ctx.createStereoPanner();
          gain.connect(pan);
          pan.connect(this.ceiling!);
          loaded.push({
            trackId: stem.trackId,
            buffer,
            gain,
            pan,
          });
          peaks.push({
            trackId: stem.trackId,
            name: stem.name,
            role: stem.role,
            peaks: extractPeaks(buffer),
          });
        }
        this.tracks = loaded;
        this.peaks = peaks;
        this.mixPeaks = sumPeaks(peaks);
        this.duration = maxDur;
        this.applyCeilingFromBuffers();
      } else if (sources.generationWav) {
        this.mode = "generation";
        const buffer = await fetchDecode(ctx, sources.generationWav);
        this.generationBuffer = buffer;
        this.duration = buffer.duration;
        const peaks = extractPeaks(buffer);
        this.peaks = [
          {
            trackId: "gen",
            name: "Stéréo",
            role: "mix",
            peaks,
          },
        ];
        this.mixPeaks = peaks;
        if (this.ceiling) this.ceiling.gain.value = 1;
      } else {
        throw new Error("Aucune source audio.");
      }
      this.applyMix(mix);
      this.ready = true;
    } catch (e) {
      this.ready = false;
      this.mode = "empty";
      throw e;
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  private applyCeilingFromBuffers() {
    if (!this.ceiling || this.tracks.length === 0) return;
    let peak = 0;
    const len = Math.max(...this.tracks.map((t) => t.buffer.length));
    const step = Math.max(1, Math.floor(len / 200_000));
    for (let i = 0; i < len; i += step) {
      let l = 0;
      let r = 0;
      for (const t of this.tracks) {
        const ch0 = t.buffer.getChannelData(0);
        const ch1 =
          t.buffer.numberOfChannels > 1
            ? t.buffer.getChannelData(1)
            : ch0;
        l += ch0[i] ?? 0;
        r += ch1[i] ?? 0;
      }
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }
    const ceiling = dbToLinear(-1);
    this.ceiling.gain.value = peak > ceiling && peak > 0 ? ceiling / peak : 1;
  }

  applyMix(mix: MixDoc | null) {
    if (!this.master) return;
    if (this.mode === "generation" || !mix) {
      this.master.gain.value = 1;
      return;
    }
    this.master.gain.value = dbToLinear(mix.masterGainDb);
    const anySolo = mix.tracks.some((t) => t.solo);
    for (const node of this.tracks) {
      const track = mix.tracks.find((t) => t.id === node.trackId);
      if (!track) {
        node.gain.gain.value = 0;
        continue;
      }
      const silent = track.mute || (anySolo && !track.solo);
      node.gain.gain.value = silent ? 0 : dbToLinear(track.gainDb);
      node.pan.pan.value = Math.max(-1, Math.min(1, track.pan));
    }
    this.notify();
  }

  async play() {
    if (!this.ready || !this.ctx) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.playing) return;
    if (this.offset >= this.duration && this.duration > 0) {
      this.offset = 0;
    }
    this.startSources(this.offset);
    this.playing = true;
    this.startRaf();
    this.notify();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getCurrentTime();
    this.stopSources(false);
    this.playing = false;
    this.stopRaf();
    this.notify();
  }

  async toggle() {
    if (this.playing) this.pause();
    else await this.play();
  }

  seek(seconds: number) {
    const t = Math.max(0, Math.min(this.duration, seconds));
    const wasPlaying = this.playing;
    this.stopSources(false);
    this.offset = t;
    this.playing = false;
    if (wasPlaying) {
      this.startSources(t);
      this.playing = true;
      this.startRaf();
    }
    this.notify();
  }

  private startSources(offset: number) {
    if (!this.ctx || !this.ceiling) return;
    this.sources = [];
    this.startedAt = this.ctx.currentTime;
    this.offset = offset;

    if (this.mode === "stems") {
      for (const track of this.tracks) {
        const src = this.ctx.createBufferSource();
        src.buffer = track.buffer;
        src.connect(track.gain);
        src.onended = () => this.onSourceEnded();
        src.start(0, offset);
        this.sources.push(src);
      }
    } else if (this.generationBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.generationBuffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(this.ceiling);
      src.onended = () => this.onSourceEnded();
      src.start(0, offset);
      this.sources.push(src);
    }
  }

  private onSourceEnded() {
    if (!this.playing) return;
    if (this.getCurrentTime() >= this.duration - 0.05) {
      this.playing = false;
      this.offset = 0;
      this.stopSources(false);
      this.stopRaf();
      this.notify();
    }
  }

  private stopSources(_resetOffset: boolean) {
    for (const src of this.sources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* */
      }
    }
    this.sources = [];
  }

  private startRaf() {
    this.stopRaf();
    const tick = () => {
      this.notify();
      if (this.playing) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.pause();
    this.stopRaf();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.master = null;
    this.ceiling = null;
    this.tracks = [];
    this.listeners.clear();
  }
}
