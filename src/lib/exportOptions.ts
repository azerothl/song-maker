import type { StemProviderId } from "@song-maker/stem-providers";

export type ExportFormat = "wav" | "flac" | "mp3";
export type ExportPack = "folder" | "zip";
export type ExportMode = "mix" | "stems";

export type ExportOptionsState = {
  mode: ExportMode;
  format: ExportFormat;
  bitDepth: 16 | 24;
  bitrateKbps: 128 | 192 | 320;
  pack: ExportPack;
};

export function defaultExportOptions(): ExportOptionsState {
  return {
    mode: "mix",
    format: "wav",
    bitDepth: 24,
    bitrateKbps: 320,
    pack: "folder",
  };
}

/** Lossless → bit depth; compressed → bitrate. Hide the other (#168). */
export function visibleExportControls(format: ExportFormat): {
  showBitDepth: boolean;
  showBitrate: boolean;
} {
  switch (format) {
    case "wav":
    case "flac":
      return { showBitDepth: true, showBitrate: false };
    case "mp3":
      return { showBitDepth: false, showBitrate: true };
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

export function isLosslessFormat(format: ExportFormat): boolean {
  return format === "wav" || format === "flac";
}

export type AcceptedLicenses = Record<string, boolean>;

export function acceptLicense(
  prev: AcceptedLicenses | undefined,
  id: StemProviderId,
): AcceptedLicenses {
  return { ...(prev ?? {}), [id]: true };
}
