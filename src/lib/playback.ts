import { convertFileSrc } from "@tauri-apps/api/core";
import { t } from "../ui/i18n";
import { api } from "./api";
import {
  float32ToLeBytes,
  mixNeedsClipProcessingBake,
  type DecodedStem,
} from "./mixBridge";
import { bakeMixPcmAsync, disposeMixBakeWorker } from "./mixBakeClient";
import {
  getProductionOverlay,
  getProductionTempoBpm,
  productionIsActive,
} from "./productionState";
import { emitPlaybackPosition } from "./playbackPosition";
import type {
  MixDoc,
  PlaybackSources,
  Vst3RealtimePlaybackConfig,
} from "./types";
import type { ScoreDocument } from "@song-maker/score-engine";
import { SoftSynth, type InstrumentProgram } from "./midiInstrument";
import { scoreTicksToSeconds } from "./scoreTiming";
import {
  hasNativeMidiVst3Request,
  needsOfflineTrackVst3Bake,
} from "./vst3RealtimePolicy";

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
  /** True when playing a buffer baked by mix-production (matches export bake). */
  productionBake: boolean;
  /** Rebake production en cours (Worker) — afficher un statut à l’utilisateur. */
  productionMixBakePending: boolean;
  /** Dernier rebake production échoué (sans détail technique Worker). */
  productionMixBakeFailed: boolean;
  productionMixBakeError: string | null;
};

type TrackNodes = {
  trackId: string;
  buffer: AudioBuffer;
  gain: GainNode;
  pan: StereoPannerNode;
  clips: {
    startMs: number;
    offsetMs: number;
    durationMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    gainDb: number;
  }[];
};

type MidiTrackNodes = {
  synth: SoftSynth;
  gain: GainNode;
  pan: StereoPannerNode;
  program: InstrumentProgram;
};

function splitInterleavedFloatPcm(bytes: number[]): {
  left: Float32Array;
  right: Float32Array;
} {
  const data = Uint8Array.from(bytes);
  if (data.byteLength === 0 || data.byteLength % 8 !== 0) {
    throw new Error("Le rendu VST3 a produit un audio stéréo invalide.");
  }
  const frames = data.byteLength / 8;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    left[frame] = view.getFloat32(frame * 8, true);
    right[frame] = view.getFloat32(frame * 8 + 4, true);
  }
  return { left, right };
}

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
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    throw new Error(t("player.audioReadFailed"));
  }
  if (resp.status === 403) {
    throw new Error(t("player.audioAccessDenied"));
  }
  if (resp.status === 404) {
    throw new Error(t("player.audioMissing"));
  }
  if (!resp.ok) {
    throw new Error(t("player.audioReadFailed"));
  }
  try {
    const bytes = await resp.arrayBuffer();
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error(t("player.audioDecodeFailed"));
  }
}

export class MixPlaybackEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ceiling: GainNode | null = null;
  private tracks: TrackNodes[] = [];
  private midiTracks = new Map<string, MidiTrackNodes>();
  private scoreDocument: ScoreDocument | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private generationBuffer: AudioBuffer | null = null;
  /** Baked stereo from mix-production — used when production overlay is active. */
  private bakedBuffer: AudioBuffer | null = null;
  private decodedStems: DecodedStem[] = [];
  private lastMix: MixDoc | null = null;
  private lastSources: PlaybackSources | null = null;
  private projectId: string | null = null;
  private nativeRealtimeActive = false;
  private nativeTrackIds = new Set<string>();
  private nativeMidiTrackIds = new Set<string>();
  private nativeConfigKey = "";
  private nativeClockSeconds: number | null = null;
  private nativeClockUpdatedAt = 0;
  private nativeClockPlaying = false;
  private productionBake = false;
  private productionMixBakePending = false;
  private productionMixBakeFailed = false;
  private productionMixBakeError: string | null = null;
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
  private bakeTimer: ReturnType<typeof setTimeout> | null = null;
  private bakeGeneration = 0;
  private activeBakeJob: { cancel: () => void } | null = null;
  private realtimeStatusTimer: ReturnType<typeof setInterval> | null = null;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    emitPlaybackPosition(this.getCurrentTime());
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
      productionBake: this.productionBake,
      productionMixBakePending: this.productionMixBakePending,
      productionMixBakeFailed: this.productionMixBakeFailed,
      productionMixBakeError: this.productionMixBakeError,
    };
  }

  /** Re-bake after production overlay changes (debounced). */
  scheduleProductionBake(mix: MixDoc | null = this.lastMix) {
    if (this.bakeTimer) clearTimeout(this.bakeTimer);
    this.bakeTimer = setTimeout(() => {
      this.bakeTimer = null;
      this.applyMix(mix);
    }, 200);
  }

  getCurrentTime(): number {
    if (this.nativeRealtimeActive && this.nativeClockSeconds != null) {
      const elapsed = this.nativeClockPlaying
        ? Math.max(0, performance.now() - this.nativeClockUpdatedAt) / 1000
        : 0;
      return Math.min(this.duration, this.nativeClockSeconds + elapsed);
    }
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

  async load(
    sources: PlaybackSources | null,
    mix: MixDoc | null,
    scoreDocument: ScoreDocument | null = null,
    projectId: string | null = null,
  ) {
    if (this.nativeConfigKey) void api.vst3RealtimeStop().catch(() => undefined);
    this.stopSources(false);
    this.tracks = [];
    this.generationBuffer = null;
    this.bakedBuffer = null;
    this.decodedStems = [];
    this.productionBake = false;
    this.productionMixBakePending = false;
    this.productionMixBakeFailed = false;
    this.productionMixBakeError = null;
    this.lastMix = mix;
    this.lastSources = sources;
    this.projectId = projectId;
    this.nativeRealtimeActive = false;
    this.nativeTrackIds.clear();
    this.nativeMidiTrackIds.clear();
    this.nativeConfigKey = "";
    this.nativeClockSeconds = null;
    this.nativeClockPlaying = false;
    this.scoreDocument = scoreDocument;
    this.peaks = [];
    this.mixPeaks = null;
    this.ready = false;
    this.duration = 0;
    this.offset = 0;
    this.playing = false;
    this.stopRaf();

    if (!sources) {
      if (scoreDocument?.voices.some((voice) => voice.notes.length > 0)) {
        this.mode = "stems";
        this.label = "MIDI";
        this.loading = true;
        this.notify();
        this.ensureCtx();
        this.duration = this.scoreDuration(scoreDocument);
        await this.applyMix(mix);
        this.configureMidiTracks(scoreDocument, mix);
        this.ready = true;
        this.loading = false;
      } else {
        this.mode = "empty";
        this.label = "";
        this.loading = false;
      }
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
        const decoded: DecodedStem[] = [];
        let maxDur = 0;
        for (const stem of sources.stems) {
          const buffer = await fetchDecode(ctx, stem.path);
          maxDur = Math.max(maxDur, buffer.duration);
          const left = new Float32Array(buffer.getChannelData(0));
          const right =
            buffer.numberOfChannels > 1
              ? new Float32Array(buffer.getChannelData(1))
              : new Float32Array(left);
          decoded.push({
            trackId: stem.trackId,
            left,
            right,
            sampleRate: buffer.sampleRate,
          });
          const gain = ctx.createGain();
          const pan = ctx.createStereoPanner();
          gain.connect(pan);
          pan.connect(this.ceiling!);
          const mixTrack = mix?.tracks.find((t) => t.id === stem.trackId);
          const clips =
            mixTrack?.clips.map((c) => ({
              startMs: c.startMs,
              offsetMs: c.offsetMs,
              durationMs: c.durationMs,
              fadeInMs: c.fadeInMs,
              fadeOutMs: c.fadeOutMs,
              gainDb: c.gainDb,
            })) ?? [
              {
                startMs: 0,
                offsetMs: 0,
                durationMs: Math.round(buffer.duration * 1000),
                fadeInMs: 0,
                fadeOutMs: 0,
                gainDb: 0,
              },
            ];
          for (const c of clips) {
            maxDur = Math.max(maxDur, (c.startMs + c.durationMs) / 1000);
          }
          loaded.push({
            trackId: stem.trackId,
            buffer,
            gain,
            pan,
            clips,
          });
          peaks.push({
            trackId: stem.trackId,
            name: stem.name,
            role: stem.role,
            peaks: extractPeaks(buffer),
          });
        }
        this.tracks = loaded;
        this.decodedStems = decoded;
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
      await this.applyMix(mix);
      this.configureMidiTracks(scoreDocument, mix);
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

  private applyBakedRenderResult(
    mix: MixDoc,
    left: Float32Array,
    right: Float32Array,
    frameCount: number,
  ): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(
      2,
      frameCount,
      mix.sampleRate || 48000,
    );
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);
    this.bakedBuffer = buf;
    this.duration = buf.duration;
    this.mixPeaks = extractPeaks(buf);
    this.productionBake = true;
    if (this.master) this.master.gain.value = 1;
    if (this.ceiling) this.ceiling.gain.value = 1;
  }

  private async processTrackEffects(
    mix: MixDoc,
    generation: number,
  ): Promise<DecodedStem[]> {
    const processed: DecodedStem[] = [];
    for (const stem of this.decodedStems) {
      const track = mix.tracks.find((candidate) => candidate.id === stem.trackId);
      const effects = (track?.vst3Effects ?? []).filter((effect) => effect.enabled);
      let current = stem;
      for (const effect of effects) {
        if (generation !== this.bakeGeneration) return [];
        const frames = Math.min(current.left.length, current.right.length);
        const interleaved = new Float32Array(frames * 2);
        for (let frame = 0; frame < frames; frame += 1) {
          interleaved[frame * 2] = current.left[frame] ?? 0;
          interleaved[frame * 2 + 1] = current.right[frame] ?? 0;
        }
        const result = await api.vst3ProcessPcm({
          path: effect.pluginPath,
          parameters: effect.parameters,
          pluginStateB64: effect.stateB64,
          sampleRate: current.sampleRate || mix.sampleRate || 48_000,
          peakCeilingDb: 0,
          pcmLe: float32ToLeBytes(interleaved),
        });
        if (generation !== this.bakeGeneration) return [];
        const stereo = splitInterleavedFloatPcm(result.pcmLe);
        current = { ...current, left: stereo.left, right: stereo.right };
      }
      processed.push(current);
    }
    return processed;
  }

  private requestProductionBakeAsync(mix: MixDoc): Promise<void> {
    if (!this.ctx || this.decodedStems.length === 0) return Promise.resolve();
    this.activeBakeJob?.cancel();
    const gen = ++this.bakeGeneration;
    this.productionMixBakePending = true;
    this.productionMixBakeFailed = false;
    this.productionMixBakeError = null;
    this.notify();
    this.activeBakeJob = { cancel: () => undefined };
    return (async () => {
      try {
        const stems = await this.processTrackEffects(mix, gen);
        if (gen !== this.bakeGeneration) return;
        const job = bakeMixPcmAsync(
          mix,
          stems,
          getProductionOverlay(),
          getProductionTempoBpm(),
        );
        this.activeBakeJob = job;
        const result = await job.result;
        if (gen !== this.bakeGeneration) return;
        this.activeBakeJob = null;
        let { left, right } = result;
        let frameCount = result.frameCount;
        if (mix.vst3MasterInsert?.enabled) {
          const vst3 = mix.vst3MasterInsert;
          const processed = await api.vst3ProcessPcm({
            path: vst3.pluginPath,
            parameters: vst3.parameters,
            pluginStateB64: vst3.stateB64,
            sampleRate:
              mix.sampleRate || this.decodedStems[0]?.sampleRate || 48_000,
            peakCeilingDb: mix.peakCeilingDb ?? -1,
            pcmLe: float32ToLeBytes(result.pcm),
          });
          if (gen !== this.bakeGeneration) return;
          const stereo = splitInterleavedFloatPcm(processed.pcmLe);
          left = stereo.left;
          right = stereo.right;
          frameCount = left.length;
        }
        const wasPlaying = this.playing;
        const t = this.getCurrentTime();
        if (wasPlaying) this.stopSources(false);
        this.applyBakedRenderResult(
          mix,
          left,
          right,
          frameCount,
        );
        if (wasPlaying) {
          this.startSources(t);
          this.playing = true;
          this.startRaf();
        }
        this.productionMixBakeFailed = false;
            this.productionMixBakeError = null;
        this.productionMixBakePending = false;
        this.notify();
      } catch (error) {
        if (gen !== this.bakeGeneration) return;
        this.activeBakeJob = null;
        this.productionMixBakePending = false;
        this.productionMixBakeFailed = true;
        this.productionMixBakeError = (error instanceof Error ? error.message : String(error)).slice(0, 1200);
        this.notify();
      }
    })();
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

  private scoreDuration(document: ScoreDocument): number {
    let end = 0;
    for (const voice of document.voices) {
      for (const note of voice.notes) {
        end = Math.max(
          end,
          scoreTicksToSeconds(document, note.startTick + note.durationTick),
        );
      }
    }
    return end;
  }

  private configureMidiTracks(
    document: ScoreDocument | null,
    mix: MixDoc | null,
  ) {
    if (!this.ctx || !this.ceiling) return;
    this.scoreDocument = document;
    const voices = (document?.voices ?? []).filter(
      (voice) => voice.notes.length > 0 && voice.id.startsWith("midi"),
    );
    const ids = new Set(voices.map((voice) => voice.id));
    for (const [id, track] of this.midiTracks) {
      if (ids.has(id)) continue;
      void track.synth.dispose();
      track.gain.disconnect();
      track.pan.disconnect();
      this.midiTracks.delete(id);
    }
    for (const voice of voices) {
      const program = (voice.instrumentProgram ?? "piano") as InstrumentProgram;
      let nodes = this.midiTracks.get(voice.id);
      if (!nodes) {
        const gain = this.ctx.createGain();
        const pan = this.ctx.createStereoPanner();
        gain.connect(pan);
        pan.connect(this.ceiling);
        const synth = new SoftSynth({
          context: this.ctx,
          destination: gain,
          latencySec: 0,
        });
        synth.setGainDb(0);
        synth.setProgram(program);
        nodes = { synth, gain, pan, program };
        this.midiTracks.set(voice.id, nodes);
      } else if (nodes.program !== program) {
        nodes.program = program;
        nodes.synth.setProgram(program);
      }
      const track = mix?.tracks.find((candidate) => candidate.id === voice.id);
      const anySolo = mix?.tracks.some((candidate) => candidate.solo) ?? false;
      const silent = Boolean(track?.mute || (anySolo && !track?.solo));
      nodes.gain.gain.value = silent ? 0 : dbToLinear(track?.gainDb ?? 0);
      nodes.pan.pan.value = Math.max(-1, Math.min(1, track?.pan ?? 0));
    }
    if (document) this.duration = Math.max(this.duration, this.scoreDuration(document));
  }

  async setScoreDocument(
    document: ScoreDocument | null,
    mix: MixDoc | null,
  ): Promise<void> {
    this.scoreDocument = document;
    if (
      !this.ctx &&
      document?.voices.some((voice) => voice.notes.length > 0)
    ) {
      this.ensureCtx();
      if (this.mode === "empty") {
        this.mode = "stems";
        this.label = "MIDI";
        this.duration = this.scoreDuration(document);
        this.ready = true;
      }
    }
    this.configureMidiTracks(document, mix);
    await this.applyMix(mix);
    if (this.playing) {
      const current = this.getCurrentTime();
      for (const track of this.midiTracks.values()) track.synth.allNotesOff();
      this.startMidiSources(current);
    }
    this.notify();
  }

  private startMidiSources(offset: number) {
    if (!this.ctx || !this.scoreDocument) return;
    const whenNow = this.ctx.currentTime;
    for (const voice of this.scoreDocument.voices) {
      if (this.nativeMidiTrackIds.has(voice.id)) continue;
      const nodes = this.midiTracks.get(voice.id);
      if (!nodes) continue;
      for (const note of voice.notes) {
        const start = scoreTicksToSeconds(this.scoreDocument, note.startTick);
        const end = scoreTicksToSeconds(
          this.scoreDocument,
          note.startTick + note.durationTick,
        );
        if (end <= offset) continue;
        const startAt = whenNow + Math.max(0, start - offset);
        const endAt = whenNow + Math.max(0.04, end - offset);
        void nodes.synth
          .noteOn(note.pitch, note.velocity, startAt)
          .then(() => nodes.synth.noteOff(note.pitch, endAt));
      }
    }
  }

  async applyMix(mix: MixDoc | null): Promise<void> {
    this.configureMidiTracks(this.scoreDocument, mix);
    if (!this.master) return;
    this.lastMix = mix;
    const nativeRealtimeReady = await this.configureNativeRealtime(mix);
    if (this.mode === "generation") {
      this.activeBakeJob?.cancel();
      this.bakeGeneration++;
      this.productionMixBakePending = false;
      this.productionMixBakeFailed =
        this.mode === "generation" && mix?.vst3MasterInsert?.enabled === true;
      this.productionMixBakeError = this.productionMixBakeFailed ? t("production.vst3.needsStems") : null;
      this.master.gain.value = 1;
      this.productionBake = false;
      this.bakedBuffer = null;
      this.notify();
      return;
    }
    if (!mix) {
      this.activeBakeJob?.cancel();
      this.bakeGeneration++;
      this.productionMixBakePending = false;
      this.productionMixBakeFailed = false;
      this.productionMixBakeError = null;
      this.master.gain.value = 1;
      this.productionBake = false;
      this.bakedBuffer = null;
      this.notify();
      return;
    }

    // Production overlay or clip stretch/takes → same bake as export (hors thread UI).
    const vst3Enabled = mix.vst3MasterInsert?.enabled === true;
    const vst3TrackEnabled = needsOfflineTrackVst3Bake(mix, nativeRealtimeReady);
    if (hasNativeMidiVst3Request(mix, this.scoreDocument) && !nativeRealtimeReady) {
      // configureNativeRealtime already exposed the native host failure. Do not
      // replace it with the unrelated "separate into stems" guidance.
      this.productionMixBakePending = false;
      this.notify();
      return;
    }
    if ((vst3Enabled || vst3TrackEnabled) && this.decodedStems.length === 0) {
      this.productionMixBakeFailed = true;
      this.productionMixBakeError = t("production.vst3.needsStems");
      this.productionMixBakePending = false;
      this.notify();
      return;
    }

    if (
      (productionIsActive() || mixNeedsClipProcessingBake(mix) || vst3Enabled || vst3TrackEnabled) &&
      this.decodedStems.length > 0
    ) {
      await this.requestProductionBakeAsync(mix);
      return;
    }

    this.activeBakeJob?.cancel();
    this.bakeGeneration++;
    this.productionMixBakePending = false;
    this.productionMixBakeFailed = false;
    this.productionMixBakeError = null;

    this.productionBake = false;
    this.bakedBuffer = null;
    this.master.gain.value = dbToLinear(mix.masterGainDb);
    const anySolo = mix.tracks.some((t) => t.solo);
    let clipsChanged = false;
    for (const node of this.tracks) {
      const track = mix.tracks.find((t) => t.id === node.trackId);
      if (!track) {
        node.gain.gain.value = 0;
        continue;
      }
      const silent = track.mute || (anySolo && !track.solo);
      node.gain.gain.value = silent ? 0 : dbToLinear(track.gainDb);
      node.pan.pan.value = Math.max(-1, Math.min(1, track.pan));
      const nextClips = track.clips.map((c) => ({
        startMs: c.startMs,
        offsetMs: c.offsetMs,
        durationMs: c.durationMs,
        fadeInMs: c.fadeInMs,
        fadeOutMs: c.fadeOutMs,
        gainDb: c.gainDb,
      }));
      if (JSON.stringify(nextClips) !== JSON.stringify(node.clips)) {
        clipsChanged = true;
      }
      node.clips = nextClips;
      let end = 0;
      for (const c of node.clips) {
        end = Math.max(end, (c.startMs + c.durationMs) / 1000);
      }
      this.duration = Math.max(this.duration, end);
    }
    this.applyCeilingFromBuffers();
    if (clipsChanged && this.playing) {
      const t = this.getCurrentTime();
      this.stopSources(false);
      this.startSources(t);
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
    if (this.nativeRealtimeActive) this.startRealtimeStatusPoll();
    this.startRaf();
    this.notify();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.getCurrentTime();
    this.nativeClockSeconds = this.offset;
    this.nativeClockUpdatedAt = performance.now();
    this.nativeClockPlaying = false;
    if (this.nativeRealtimeActive) {
      void api.vst3RealtimePause().catch(() => undefined);
    }
    this.stopRealtimeStatusPoll();
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
    this.nativeClockSeconds = t;
    this.nativeClockUpdatedAt = performance.now();
    this.nativeClockPlaying = wasPlaying && this.nativeRealtimeActive;
    if (this.nativeRealtimeActive) {
      void api.vst3RealtimeSeek(t).catch(() => undefined);
    }
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
    if (this.nativeRealtimeActive) {
      this.nativeClockSeconds = offset;
      this.nativeClockUpdatedAt = performance.now();
      this.nativeClockPlaying = true;
      void api.vst3RealtimePlay(offset).catch((error) => {
        this.productionMixBakeFailed = true;
        this.productionMixBakeError = error instanceof Error ? error.message : String(error);
        this.notify();
      });
    }
    this.startMidiSources(offset);

    if (this.productionBake && this.bakedBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bakedBuffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(this.ceiling);
      src.onended = () => this.onSourceEnded();
      src.start(0, offset);
      this.sources.push(src);
      return;
    }

    if (this.mode === "stems") {
      for (const track of this.tracks) {
        if (this.nativeTrackIds.has(track.trackId)) continue;
        for (const clip of track.clips) {
          const clipStartSec = clip.startMs / 1000;
          const clipDurSec = Math.max(0.001, clip.durationMs / 1000);
          const clipEndSec = clipStartSec + clipDurSec;
          if (offset >= clipEndSec) continue;

          const when = this.ctx.currentTime + Math.max(0, clipStartSec - offset);
          const offsetIntoClip = Math.max(0, offset - clipStartSec);
          const remaining = clipDurSec - offsetIntoClip;
          if (remaining <= 0) continue;

          const src = this.ctx.createBufferSource();
          src.buffer = track.buffer;
          const clipGain = this.ctx.createGain();
          clipGain.gain.value = dbToLinear(clip.gainDb);
          // Linear fade envelopes relative to clip start.
          const fadeInSec = clip.fadeInMs / 1000;
          const fadeOutSec = clip.fadeOutMs / 1000;
          const g = clipGain.gain;
          const now = when;
          g.cancelScheduledValues(now);
          if (fadeInSec > 0 && offsetIntoClip < fadeInSec) {
            const already = offsetIntoClip / fadeInSec;
            g.setValueAtTime(already * dbToLinear(clip.gainDb), now);
            g.linearRampToValueAtTime(
              dbToLinear(clip.gainDb),
              now + (fadeInSec - offsetIntoClip),
            );
          } else {
            g.setValueAtTime(dbToLinear(clip.gainDb), now);
          }
          if (fadeOutSec > 0) {
            const fadeOutStart = clipDurSec - fadeOutSec;
            if (offsetIntoClip < clipDurSec) {
              const startFadeAt = now + Math.max(0, fadeOutStart - offsetIntoClip);
              const endAt = now + remaining;
              if (endAt > startFadeAt) {
                g.setValueAtTime(dbToLinear(clip.gainDb), startFadeAt);
                g.linearRampToValueAtTime(0, endAt);
              }
            }
          }
          src.connect(clipGain);
          clipGain.connect(track.gain);
          src.onended = () => this.onSourceEnded();
          src.start(when, clip.offsetMs / 1000 + offsetIntoClip, remaining);
          this.sources.push(src);
        }
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
    for (const track of this.midiTracks.values()) track.synth.allNotesOff();
    for (const src of this.sources) {
      try {
        src.onended = null;
        src.stop();
      } catch (error) {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch (error) {
        /* */
      }
    }
    this.sources = [];
  }

  private startRaf() {
    this.stopRaf();
    const tick = () => {
      emitPlaybackPosition(this.getCurrentTime());
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
    this.stopRealtimeStatusPoll();
    if (this.nativeConfigKey) void api.vst3RealtimeStop().catch(() => undefined);
    this.stopRaf();
    this.activeBakeJob?.cancel();
    this.bakeGeneration++;
    if (this.bakeTimer) clearTimeout(this.bakeTimer);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.master = null;
    this.ceiling = null;
    this.tracks = [];
    for (const track of this.midiTracks.values()) {
      void track.synth.dispose();
      track.gain.disconnect();
      track.pan.disconnect();
    }
    this.midiTracks.clear();
    this.scoreDocument = null;
    this.decodedStems = [];
    this.bakedBuffer = null;
    this.listeners.clear();
    disposeMixBakeWorker();
  }

  private async configureNativeRealtime(mix: MixDoc | null): Promise<boolean> {
    const score = this.scoreDocument;
    const canUseNative = Boolean(
      (mix?.tracks.some((track) => track.vst3Effects?.some((effect) => effect.enabled)) ||
        score?.voices.some((voice) => voice.vst3Instrument && voice.notes.length > 0)) &&
        !mix?.vst3MasterInsert?.enabled &&
        !productionIsActive() &&
        !(mix && mixNeedsClipProcessingBake(mix)),
    );
    if (!canUseNative) {
      if (this.nativeConfigKey) void api.vst3RealtimeStop().catch(() => undefined);
      this.nativeRealtimeActive = false;
      this.nativeTrackIds.clear();
      this.nativeMidiTrackIds.clear();
      this.nativeConfigKey = "";
      this.nativeClockSeconds = null;
      this.nativeClockPlaying = false;
      return false;
    }

    const tracks: Vst3RealtimePlaybackConfig["tracks"] = [];
    const sourceByTrack = new Map(
      (this.lastSources?.stems ?? []).map((stem) => [stem.trackId, stem]),
    );
    const mixTracks = mix?.tracks ?? [];
    const anySolo = mixTracks.some((track) => track.solo);
    for (const track of mixTracks) {
      const effects = track.vst3Effects ?? [];
      if (!effects.some((effect) => effect.enabled)) continue;
      if (track.mute || (anySolo && !track.solo)) continue;
      const stem = sourceByTrack.get(track.id);
      const isMidi = track.role.toLowerCase() === "midi";
      if (isMidi) continue;
      if (!isMidi && !stem) continue;
      tracks.push({
        id: track.id,
        name: track.name,
        role: track.role,
        path: stem?.path ?? null,
        gainDb: track.gainDb,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        clips: track.clips,
        effects,
        instrument: null,
        notes: [],
      });
    }

    for (const voice of score?.voices ?? []) {
      if (voice.notes.length === 0) continue;
      const track = mixTracks.find((candidate) => candidate.id === voice.id);
      const instrument = voice.vst3Instrument;
      const effects = track?.vst3Effects ?? [];
      if (!instrument && !effects.some((effect) => effect.enabled)) continue;
      if (track?.mute || (anySolo && !track?.solo)) continue;
      if (tracks.some((candidate) => candidate.id === voice.id)) continue;
      tracks.push({
        id: voice.id,
        name: track?.name ?? voice.name,
        role: "midi",
        path: null,
        gainDb: track?.gainDb ?? 0,
        pan: track?.pan ?? 0,
        mute: track?.mute ?? false,
        solo: track?.solo ?? false,
        clips: [],
        effects,
        instrument: instrument
          ? {
              pluginPath: instrument.pluginPath,
              pluginName: instrument.pluginName,
              parameters: instrument.parameters,
              stateB64: instrument.stateB64,
            }
          : null,
        notes: voice.notes.map((note) => ({
          startSeconds: scoreTicksToSeconds(score!, note.startTick),
          endSeconds: scoreTicksToSeconds(
            score!,
            note.startTick + note.durationTick,
          ),
          pitch: note.pitch,
          velocity: note.velocity,
        })),
      });
    }

    if (tracks.length === 0) {
      if (this.nativeConfigKey) void api.vst3RealtimeStop().catch(() => undefined);
      this.nativeRealtimeActive = false;
      this.nativeTrackIds.clear();
      this.nativeMidiTrackIds.clear();
      this.nativeConfigKey = "";
      this.nativeClockSeconds = null;
      this.nativeClockPlaying = false;
      return false;
    }

    const config: Vst3RealtimePlaybackConfig = {
      masterGainDb: mix?.masterGainDb ?? 0,
      anySolo,
      tracks,
    };
    const key = `${this.projectId ?? ""}:${JSON.stringify(config)}`;
    if (key === this.nativeConfigKey && this.nativeRealtimeActive) return true;
    const wasPlaying = this.playing;
    const current = this.getCurrentTime();
    try {
      const status = await api.vst3RealtimeConfigure(config);
      this.nativeTrackIds = new Set(status.activeTrackIds);
      this.nativeMidiTrackIds = new Set(status.activeMidiTrackIds);
      this.nativeRealtimeActive =
        this.nativeTrackIds.size > 0 || this.nativeMidiTrackIds.size > 0;
      this.nativeConfigKey = this.nativeRealtimeActive ? key : "";
      this.duration = Math.max(this.duration, status.durationSeconds);
      this.nativeClockSeconds = current;
      this.nativeClockUpdatedAt = performance.now();
      this.nativeClockPlaying = false;
      if (wasPlaying && this.nativeRealtimeActive) {
        this.nativeClockPlaying = true;
        void api.vst3RealtimePlay(current).catch(() => undefined);
        this.startRealtimeStatusPoll();
      }
      return this.nativeRealtimeActive;
    } catch (error) {
      void api.vst3RealtimeStop().catch(() => undefined);
      this.nativeRealtimeActive = false;
      this.nativeTrackIds.clear();
      this.nativeMidiTrackIds.clear();
      this.nativeConfigKey = "";
      this.nativeClockSeconds = null;
      this.nativeClockPlaying = false;
      this.productionMixBakeFailed = true;
      this.productionMixBakeError =
        error instanceof Error ? error.message : String(error);
      this.notify();
      return false;
    }
  }

  private startRealtimeStatusPoll() {
    this.stopRealtimeStatusPoll();
    this.realtimeStatusTimer = setInterval(() => {
      void api.vst3RealtimeStatus().then((status) => {
        if (!status) return;
        this.nativeClockSeconds = status.currentSeconds;
        this.nativeClockUpdatedAt = performance.now();
        this.nativeClockPlaying = status.playing;
        if (status.renderError) {
          this.productionMixBakeFailed = true;
          this.productionMixBakeError = t("production.vst3.realtimeFailed");
          this.pause();
          this.notify();
          return;
        }
        if (this.playing && !status.playing && status.currentSeconds >= this.duration - 0.05) {
          this.playing = false;
          this.offset = 0;
          this.nativeClockSeconds = 0;
          this.nativeClockUpdatedAt = performance.now();
          this.stopSources(false);
          this.stopRaf();
          this.stopRealtimeStatusPoll();
          this.notify();
        }
      }).catch(() => undefined);
    }, 250);
  }

  private stopRealtimeStatusPoll() {
    if (this.realtimeStatusTimer) clearInterval(this.realtimeStatusTimer);
    this.realtimeStatusTimer = null;
  }
}
