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
  },
): Promise<string> {
  const vst3Enabled = mix?.vst3MasterInsert?.enabled === true;
  if (
    vst3Enabled &&
    (!mix || !sources || sources.mode !== "stems" || sources.stems.length === 0)
  ) {
    throw new Error(
      "Pour appliquer l’effet VST3, séparez d’abord la prise en pistes dans Production.",
    );
  }
  if (
    (shouldUseProductionExport() || vst3Enabled) &&
    mix &&
    sources &&
    sources.mode === "stems" &&
    sources.stems.length > 0
  ) {
    const { stems, sampleRate } = await decodeMixStems(sources, mix);
    const baked = bakeMixPcm(mix, stems);
    const renderSampleRate = mix.sampleRate || sampleRate;
    const vst3Processed = vst3Enabled
      ? await api.vst3ProcessPcm({
          path: mix.vst3MasterInsert!.pluginPath,
          parameters: mix.vst3MasterInsert!.parameters,
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
      renderPath: vst3Enabled
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
  if (sources.mode !== "stems" || sources.stems.length === 0) {
    throw new Error("Pas de stems à exporter.");
  }
  const { stems, sampleRate } = await decodeMixStems(sources, mix);
  const toolkit = getProductionToolkit();
  const overlay = getProductionOverlay();
  const baked = bakeAlignedStems({
    mixId: mix.id,
    sampleRate: opts.sampleRate || mix.sampleRate || sampleRate,
    masterGainDb: mix.masterGainDb,
    peakCeilingDb: mix.peakCeilingDb,
    tracks: tracksToRenderInput(mix, stems),
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
