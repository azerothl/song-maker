import { createRoot } from "react-dom/client";
import { roleWaveColor, resolveWaveFillColors } from "../lib/trackRoleColors";
import {
  buildWaveformLayers,
  countImageDataDiff,
  paintWaveformProgress,
  renderWaveformReferenceFrame,
  resolveMutedDrawColors,
  type WaveformDrawColors,
} from "../components/waveformDraw";

export type ParityCase = {
  id: string;
  widthCss: number;
  heightCss: number;
  progressRatio: number;
  muted: boolean;
  role?: string;
  frameBg?: string;
  canvasBg?: string;
};

/** 18 configurations (aligné relecture Alphonse). */
export const PARITY_CASES: ParityCase[] = [
  { id: "w280-h36-r0-vocals", widthCss: 280, heightCss: 36, progressRatio: 0, muted: false, role: "vocals", frameBg: "#171320" },
  { id: "w280-h48-r05-drums", widthCss: 280, heightCss: 48, progressRatio: 0.5, muted: false, role: "drums", frameBg: "#171320" },
  { id: "w280-h58-r1-bass", widthCss: 280, heightCss: 58, progressRatio: 1, muted: false, role: "bass", frameBg: "#171320" },
  { id: "w400-h36-r012-other", widthCss: 400, heightCss: 36, progressRatio: 0.12, muted: false, role: "other", frameBg: "#171320" },
  { id: "w400-h48-r05-vocals", widthCss: 400, heightCss: 48, progressRatio: 0.5, muted: false, role: "vocals", frameBg: "#171320" },
  { id: "w400-h56-r088-drums", widthCss: 400, heightCss: 56, progressRatio: 0.88, muted: false, role: "drums", frameBg: "#171320" },
  { id: "w640-h36-r05-bass", widthCss: 640, heightCss: 36, progressRatio: 0.5, muted: false, role: "bass", frameBg: "#171320" },
  { id: "w640-h48-r0-other", widthCss: 640, heightCss: 48, progressRatio: 0, muted: false, role: "other", frameBg: "#171320" },
  { id: "w640-h58-r1-vocals", widthCss: 640, heightCss: 58, progressRatio: 1, muted: false, role: "vocals", frameBg: "#171320" },
  { id: "w640-h56-r05-drums", widthCss: 640, heightCss: 56, progressRatio: 0.5, muted: false, role: "drums", frameBg: "#171320" },
  { id: "w400-h48-r05-muted", widthCss: 400, heightCss: 48, progressRatio: 0.5, muted: true, frameBg: "#171320" },
  { id: "master-translucent-50", widthCss: 640, heightCss: 56, progressRatio: 0.5, muted: false, role: "vocals", frameBg: "rgba(0, 0, 0, 0.25)", canvasBg: "rgba(0, 0, 0, 0.25)" },
  { id: "master-translucent-12", widthCss: 640, heightCss: 56, progressRatio: 0.12, muted: false, role: "vocals", frameBg: "rgba(0, 0, 0, 0.25)", canvasBg: "rgba(0, 0, 0, 0.25)" },
  { id: "w280-h48-r05-bass2", widthCss: 280, heightCss: 48, progressRatio: 0.5, muted: false, role: "bass", frameBg: "#171320" },
  { id: "w400-h58-r05-vocals2", widthCss: 400, heightCss: 58, progressRatio: 0.5, muted: false, role: "vocals", frameBg: "#171320" },
  { id: "w640-h48-r05-drums2", widthCss: 640, heightCss: 48, progressRatio: 0.5, muted: false, role: "drums", frameBg: "#171320" },
  { id: "w280-h56-r088-other2", widthCss: 280, heightCss: 56, progressRatio: 0.88, muted: false, role: "other", frameBg: "#171320" },
  { id: "w640-h36-r012-vocals", widthCss: 640, heightCss: 36, progressRatio: 0.12, muted: false, role: "vocals", frameBg: "#171320" },
];

function syntheticPeaks(seed: number, buckets = 600): Float32Array {
  const peaks = new Float32Array(buckets);
  let s = seed;
  for (let i = 0; i < buckets; i++) {
    s = (s * 16807 + 1) % 2147483647;
    peaks[i] = (s % 1000) / 1000;
  }
  return peaks;
}

function mountCase(
  dpr: number,
  caseDef: ParityCase,
): { differingPixels: number; maxChannelDelta: number; totalPixels: number } {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    get: () => dpr,
  });

  const root = document.createElement("div");
  document.body.appendChild(root);

  const frame = document.createElement("div");
  frame.className = "waveform-frame";
  frame.style.width = `${caseDef.widthCss}px`;
  frame.style.height = `${caseDef.heightCss}px`;
  if (caseDef.frameBg) frame.style.backgroundColor = caseDef.frameBg;

  const refCanvas = document.createElement("canvas");
  refCanvas.className = "waveform-canvas";
  refCanvas.style.width = `${caseDef.widthCss}px`;
  refCanvas.style.height = `${caseDef.heightCss}px`;
  if (caseDef.canvasBg) refCanvas.style.background = caseDef.canvasBg;

  const optCanvas = document.createElement("canvas");
  optCanvas.className = "waveform-canvas";
  optCanvas.style.width = `${caseDef.widthCss}px`;
  optCanvas.style.height = `${caseDef.heightCss}px`;
  if (caseDef.canvasBg) optCanvas.style.background = caseDef.canvasBg;

  frame.appendChild(refCanvas);
  frame.appendChild(optCanvas);
  root.appendChild(frame);

  void refCanvas.offsetWidth;
  void optCanvas.offsetWidth;

  const peaks = syntheticPeaks(caseDef.id.length * 17, 600);
  const duration = 200;
  const progress = caseDef.progressRatio * duration;
  const colors: WaveformDrawColors = caseDef.muted
    ? resolveMutedDrawColors()
    : resolveWaveFillColors(roleWaveColor(caseDef.role ?? "vocals"));
  const backdrop =
    caseDef.frameBg ??
    (caseDef.canvasBg ? caseDef.canvasBg : "rgb(23, 19, 32)");

  renderWaveformReferenceFrame(refCanvas, {
    peaks,
    progress,
    duration,
    heightCss: caseDef.heightCss,
    widthCss: caseDef.widthCss,
    colors,
    backdrop,
  });

  const layers = buildWaveformLayers(
    optCanvas,
    peaks,
    caseDef.heightCss,
    colors,
    backdrop,
  );
  if (!layers) {
    document.body.removeChild(root);
    return { differingPixels: 1, maxChannelDelta: 255, totalPixels: 1 };
  }
  paintWaveformProgress(optCanvas, layers, progress, duration);

  const refCtx = refCanvas.getContext("2d");
  const optCtx = optCanvas.getContext("2d");
  if (!refCtx || !optCtx) {
    document.body.removeChild(root);
    return { differingPixels: 1, maxChannelDelta: 255, totalPixels: 1 };
  }
  const refData = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);
  const optData = optCtx.getImageData(0, 0, optCanvas.width, optCanvas.height);
  const { differingPixels, maxChannelDelta } = countImageDataDiff(
    refData,
    optData,
    0,
  );
  document.body.removeChild(root);
  return {
    differingPixels,
    maxChannelDelta,
    totalPixels: refCanvas.width * refCanvas.height,
  };
}

export async function runWaveformRenderParity(dprs: number[] = [1, 1.5]) {
  const results: Array<{
    dpr: number;
    caseId: string;
    differingPixels: number;
    maxChannelDelta: number;
    totalPixels: number;
  }> = [];
  for (const dpr of dprs) {
    for (const c of PARITY_CASES) {
      const r = mountCase(dpr, c);
      results.push({ dpr, caseId: c.id, ...r });
    }
  }
  return results;
}

declare global {
  interface Window {
    __waveformRenderParity?: { run: typeof runWaveformRenderParity };
  }
}

window.__waveformRenderParity = { run: runWaveformRenderParity };

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(null);
}
