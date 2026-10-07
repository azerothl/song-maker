/** Native capture backends available to the recording panel (#330). */

export type NativeCaptureBackend = {
  hostApi: string;
  exclusive: boolean;
  asio: boolean;
  platform: string;
  roundTripMeasured: boolean;
  notesFr: string;
};

export type NativeInputDevice = {
  id: string;
  name: string;
  isDefault: boolean;
  sampleRate: number | null;
  channels: number | null;
  bufferFrames: number | null;
  estimatedRoundTripMs: number | null;
  wasapiDeviceId?: string | null;
};

export type NativeCapturePoll = {
  sessionId: string;
  peak: number;
  frames: number;
  sampleRate: number;
  channels: number;
  bufferFrames: number;
  estimatedRoundTripMs: number;
  paused: boolean;
};

export type NativeCaptureStopResult = {
  sessionId: string;
  relativePath: string;
  absolutePath: string;
  durationMs: number;
  sampleRate: number;
  estimatedRoundTripMs: number;
};

export type CaptureEngine = "native" | "webview";

export function formatNativeBackend(info: NativeCaptureBackend): string {
  const exclusive = info.exclusive ? "exclusif" : "partagé";
  const asio = info.asio ? "ASIO" : "sans ASIO";
  return `${info.hostApi} (${exclusive}, ${asio})`;
}

export function nativeRoundTripLabel(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms)} ms`;
}
