import { createRoot } from "react-dom/client";
import { Waveform } from "../components/Waveform";
import { emitPlaybackPosition } from "../lib/playbackPosition";

function Harness() {
  return (
    <Waveform
      peaks={null}
      progress={0}
      duration={180}
      height={48}
      status="empty"
    />
  );
}

export function tickEmptyWaveformAria(seconds: number): {
  valueNow: string | null;
  valueText: string | null;
} {
  emitPlaybackPosition(seconds);
  const canvas = document.querySelector<HTMLCanvasElement>("canvas.waveform-canvas");
  return {
    valueNow: canvas?.getAttribute("aria-valuenow") ?? null,
    valueText: canvas?.getAttribute("aria-valuetext") ?? null,
  };
}

declare global {
  interface Window {
    __waveformAriaHarness?: { tick: typeof tickEmptyWaveformAria };
  }
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Harness />);
  window.__waveformAriaHarness = { tick: tickEmptyWaveformAria };
}
