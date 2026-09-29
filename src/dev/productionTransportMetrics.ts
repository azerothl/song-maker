/** Mesures DOM du bandeau master Production (lecture + waveform globale). */

function r1(v: number): number {
  return Math.round(v * 100) / 100;
}

function rect(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

export type ProductionTransportMetrics = {
  playButtonPx: { width: number; height: number };
  globalWaveformPx: { width: number; height: number };
  bannerPx: { width: number; height: number };
  waveformWidthShare: number;
};

export function measureProductionTransport(): ProductionTransportMetrics | null {
  const banner = document.querySelector(".production-mix-master.mix-master-banner");
  const play = document.querySelector(".mix-master-play");
  const waveCanvas = document.querySelector(".mix-master-wave .waveform-canvas");
  if (!banner || !play || !waveCanvas) return null;

  const bannerR = rect(banner);
  const playR = rect(play);
  const waveR = rect(waveCanvas);

  const bannerWidth = bannerR.width;
  const waveWidth = waveR.width;

  return {
    playButtonPx: { width: r1(playR.width), height: r1(playR.height) },
    globalWaveformPx: { width: r1(waveR.width), height: r1(waveR.height) },
    bannerPx: { width: r1(bannerWidth), height: r1(bannerR.height) },
    waveformWidthShare: bannerWidth > 0 ? r1(waveWidth / bannerWidth) : 0,
  };
}
