import {
  bakeAlignedStems,
  placeClipsOnTimeline,
  type MixTrackRenderInput,
} from "@song-maker/mix-production";
import { api } from "./api";
import {
  bakeMixPcm,
  decodeMixStems,
  float32ToLeBytes,
  shouldUseProductionExport,
  type DecodedStem,
} from "./mixBridge";
import {
  getProductionOverlay,
  getProductionTempoBpm,
  getProductionToolkit,
} from "./productionState";
import type { MixDoc, PlaybackSources, ProjectDoc } from "./types";
import type { ScoreDocument } from "./score";
import { hasArrangementMidi, renderMidiMixStems } from "./midiMixRender";
import {
  buildPortablePackagePlan,
  formatBytes,
  type PortablePackagePlan,
} from "./projectPackage";

/**
 * Export using the shared mix-production bake when a production overlay is
 * active (matches Web Audio bake). Otherwise falls back to the Rust §10.5 path.
 */
export async function exportProjectAudio(
  projectId: string,
  format: "wav" | "flac" | "mp3",
  mix: MixDoc | null,
  sources: PlaybackSources | null,
  options?: {
    bitDepth?: 16 | 24;
    bitrateKbps?: 128 | 192 | 320;
    pack?: "folder" | "zip";
    score?: ScoreDocument | null;
  },
): Promise<string> {
  const score = options?.score === undefined && mix?.tracks.some(track => track.role === "midi")
    ? await api.loadScore(projectId) as ScoreDocument | null
    : options?.score ?? null;
  const midiEnabled = hasArrangementMidi(mix, score);
  const vst3Enabled = mix?.vst3MasterInsert?.enabled === true;
  const vst3TrackEnabled = Boolean(
    mix?.tracks.some((track) => track.vst3Effects?.some((effect) => effect.enabled)),
  );
  if (
    (vst3Enabled || vst3TrackEnabled) &&
    (!mix || (!midiEnabled && (!sources || sources.mode !== "stems" || sources.stems.length === 0)))
  ) {
    throw new Error(
      "Pour appliquer l’effet VST3, séparez d’abord la prise en pistes dans Production.",
    );
  }
  if (
    (shouldUseProductionExport() || vst3Enabled || vst3TrackEnabled || midiEnabled) &&
    mix &&
    (midiEnabled || (sources?.mode === "stems" && sources.stems.length > 0))
  ) {
    const { stems, sampleRate, renderMix } = await prepareMixRenderSources(mix, sources, score);
    const processedStems = await processTrackVst3Effects(renderMix, stems);
    const baked = bakeMixPcm(renderMix, processedStems);
    const renderSampleRate = mix.sampleRate || sampleRate;
    const vst3Processed = vst3Enabled
      ? await api.vst3ProcessPcm({
          path: mix.vst3MasterInsert!.pluginPath,
          parameters: mix.vst3MasterInsert!.parameters,
          pluginStateB64: mix.vst3MasterInsert!.stateB64,
          sampleRate: renderSampleRate,
          peakCeilingDb: mix.peakCeilingDb ?? -1,
          pcmLe: float32ToLeBytes(baked.pcm),
        })
      : null;
    return api.exportPcmAudio(projectId, {
      format,
      pcmLe: vst3Processed?.pcmLe ?? float32ToLeBytes(baked.pcm),
      sampleRate: renderSampleRate,
      channels: 2,
      peakTrimDb: baked.peakTrimDb + (vst3Processed?.peakTrimDb ?? 0),
      renderPath: vst3Enabled || vst3TrackEnabled
        ? `mix-production-ts/vst3/${baked.path}`
        : `mix-production-ts/${baked.path}`,
      matchMode: "approximate",
      bitDepth: options?.bitDepth,
      bitrateKbps: options?.bitrateKbps,
      pack: options?.pack,
    });
  }
  return api.exportAudio(projectId, format, {
    bitDepth: options?.bitDepth,
    bitrateKbps: options?.bitrateKbps,
    pack: options?.pack,
  });
}

/** Shared audio/MIDI input for exports and the assistant's measured summaries. */
export async function prepareMixRenderSources(
  mix: MixDoc, sources: PlaybackSources | null, score: ScoreDocument | null,
): Promise<{ stems: DecodedStem[]; sampleRate: number; renderMix: MixDoc }> {
  let renderMix = mix;
  let stems: DecodedStem[] = [];
  if (sources?.mode === "stems" && sources.stems.length) {
    stems = (await decodeMixStems(sources, mix)).stems;
  } else if (sources?.mode === "generation" && sources.generationWav) {
    const id = "generation-mix-source";
    renderMix = { ...mix, tracks: [...mix.tracks, {
      id, role: "mix", name: sources.label, gainDb: 0, pan: 0,
      mute: false, solo: false, locked: false, aiSeparated: false, clips: [],
    }] };
    stems = (await decodeMixStems({ ...sources, mode: "stems", stems: [{
      trackId: id, name: sources.label, role: "mix", path: sources.generationWav,
    }] }, mix)).stems;
  }
  stems.push(...await renderMidiMixStems(mix, score));
  if (!stems.length) throw new Error("Ajoutez une piste audio ou des notes MIDI avant d’exporter.");
  return { stems, sampleRate: mix.sampleRate || 48_000, renderMix };
}

export async function processTrackVst3Effects(
  mix: MixDoc,
  stems: DecodedStem[],
): Promise<DecodedStem[]> {
  const result: DecodedStem[] = [];
  for (const stem of stems) {
    let current = stem;
    const effects = (mix.tracks.find((track) => track.id === stem.trackId)?.vst3Effects ?? [])
      .filter((effect) => effect.enabled);
    for (const effect of effects) {
      const frames = Math.min(current.left.length, current.right.length);
      const interleaved = new Float32Array(frames * 2);
      for (let frame = 0; frame < frames; frame += 1) {
        interleaved[frame * 2] = current.left[frame] ?? 0;
        interleaved[frame * 2 + 1] = current.right[frame] ?? 0;
      }
      const processed = await api.vst3ProcessPcm({
        path: effect.pluginPath,
        parameters: effect.parameters,
        pluginStateB64: effect.stateB64,
        sampleRate: current.sampleRate || mix.sampleRate || 48_000,
        peakCeilingDb: 0,
        pcmLe: float32ToLeBytes(interleaved),
      });
      const bytes = Uint8Array.from(processed.pcmLe);
      if (bytes.byteLength === 0 || bytes.byteLength % 8 !== 0) {
        throw new Error("Le rendu de l’effet VST3 a produit un audio stéréo invalide.");
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const outLeft = new Float32Array(bytes.byteLength / 8);
      const outRight = new Float32Array(bytes.byteLength / 8);
      for (let frame = 0; frame < outLeft.length; frame += 1) {
        outLeft[frame] = view.getFloat32(frame * 8, true);
        outRight[frame] = view.getFloat32(frame * 8 + 4, true);
      }
      current = { ...current, left: outLeft, right: outRight };
    }
    result.push(current);
  }
  return result;
}

function tracksToRenderInput(
  mix: MixDoc,
  stems: DecodedStem[],
): MixTrackRenderInput[] {
  const sampleRate = mix.sampleRate || stems[0]?.sampleRate || 48000;
  const byId = new Map(stems.map((s) => [s.trackId, s]));
  return mix.tracks.map((track) => {
    const src = byId.get(track.id);
    const empty = new Float32Array(1);
    const left = src?.left ?? empty;
    const right = src?.right ?? empty;
    const clips =
      track.clips.length > 0
        ? track.clips.map((c) => ({
            startMs: c.startMs,
            offsetMs: c.offsetMs,
            durationMs: c.durationMs,
            fadeInMs: c.fadeInMs,
            fadeOutMs: c.fadeOutMs,
            gainDb: c.gainDb,
          }))
        : [
            {
              startMs: 0,
              offsetMs: 0,
              durationMs: Math.round((left.length / sampleRate) * 1000),
              fadeInMs: 0,
              fadeOutMs: 0,
              gainDb: 0,
            },
          ];
    const placed = placeClipsOnTimeline(left, right, clips, sampleRate);
    return {
      trackId: track.id,
      left: placed.left,
      right: placed.right,
      gainDb: track.gainDb,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
    };
  });
}

export type StemExportOptions = {
  format: "wav" | "flac";
  selectedTrackIds: string[];
  includeMaster?: boolean;
  sampleRate?: number;
  bitDepth?: 16 | 24;
  score?: ScoreDocument | null;
};

/**
 * Export aligned stems (and optional master) sharing origin t=0 / equal length.
 */
export async function exportAlignedStems(
  projectId: string,
  mix: MixDoc,
  sources: PlaybackSources,
  opts: StemExportOptions,
): Promise<string[]> {
  const score = opts.score === undefined ? await api.loadScore(projectId) as ScoreDocument | null : opts.score;
  if ((sources.mode !== "stems" || sources.stems.length === 0) && !hasArrangementMidi(mix, score)) {
    throw new Error("Pas de pistes à exporter.");
  }
  const { stems, sampleRate } = await prepareMixRenderSources(mix, sources, score);
  const processedStems = await processTrackVst3Effects(mix, stems);
  const toolkit = getProductionToolkit();
  const overlay = getProductionOverlay();
  const baked = bakeAlignedStems({
    mixId: mix.id,
    sampleRate: opts.sampleRate || mix.sampleRate || sampleRate,
    masterGainDb: mix.masterGainDb,
    peakCeilingDb: mix.peakCeilingDb,
    tracks: tracksToRenderInput(mix, processedStems),
    trackMeta: mix.tracks.map((t) => ({
      trackId: t.id,
      role: t.role,
      name: t.name,
    })),
    selectedTrackIds: opts.selectedTrackIds,
    includeMaster: opts.includeMaster ?? false,
    automation: toolkit.automation,
    effects: toolkit.effects,
    sidechain: toolkit.sidechain,
    buses: overlay?.buses,
    sends: overlay?.sends,
    trackGroupIds: overlay?.trackGroupIds,
    tempoBpm: getProductionTempoBpm(),
  });

  const paths: string[] = [];
  for (const stem of baked.stems) {
    const path = await api.exportPcmAudio(projectId, {
      format: opts.format,
      pcmLe: float32ToLeBytes(stem.pcm),
      sampleRate: baked.sampleRate,
      channels: 2,
      peakTrimDb: stem.peakTrimDb,
      renderPath: `mix-production-ts/stem/${stem.fileStem}`,
      matchMode: "approximate",
      fileStem: `stem-${stem.fileStem}`,
      bitDepth: opts.bitDepth,
    });
    paths.push(path);
  }
  if (baked.master) {
    const vst3Master =
      mix.vst3MasterInsert?.enabled === true
        ? await api.vst3ProcessPcm({
            path: mix.vst3MasterInsert.pluginPath,
            parameters: mix.vst3MasterInsert.parameters,
            pluginStateB64: mix.vst3MasterInsert.stateB64,
            sampleRate: baked.sampleRate,
            peakCeilingDb: mix.peakCeilingDb ?? -1,
            pcmLe: float32ToLeBytes(baked.master.pcm),
          })
        : null;
    const path = await api.exportPcmAudio(projectId, {
      format: opts.format,
      pcmLe: vst3Master?.pcmLe ?? float32ToLeBytes(baked.master.pcm),
      sampleRate: baked.sampleRate,
      channels: 2,
      peakTrimDb:
        baked.master.peakTrimDb + (vst3Master?.peakTrimDb ?? 0),
      renderPath: vst3Master
        ? `mix-production-ts/vst3/stem/master`
        : `mix-production-ts/stem/master`,
      matchMode: "approximate",
      fileStem: "stem-master",
    });
    paths.push(path);
  }
  return paths;
}

export async function planPortablePackage(
  project: ProjectDoc,
): Promise<PortablePackagePlan> {
  const inventory = await api.listProjectPackageInventory(project.id);
  return buildPortablePackagePlan({
    projectId: project.id,
    title: project.title,
    inventory,
  });
}

export async function exportPortablePackage(
  projectId: string,
): Promise<{ path: string; plan: PortablePackagePlan }> {
  const overlay = getProductionOverlay();
  if (overlay) {
    await api.saveProductionOverlay(projectId, overlay.mixId, overlay);
  }
  const result = await api.exportProjectPackage(projectId);
  return {
    path: result.path,
    plan: result.plan,
  };
}

export { formatBytes };
