import { useEffect, useMemo, useState } from "react";
import type { AutomationPoint, LoudnessReport } from "@song-maker/mix-production";
import type { MixDoc } from "../lib/types";
import {
  getProductionOverlay,
  getProductionToolkit,
  patchProductionOverlay,
  productionIsActive,
  subscribeProduction,
} from "../lib/productionState";
import { t } from "../ui/i18n";

type Props = {
  mix: MixDoc | null;
};

/**
 * Phase 3 production panel — writes automation / FX / sidechain into the
 * shared overlay used by Web Audio bake and offline export.
 */
export function Phase3MixPanel({ mix }: Props) {
  const [trackId, setTrackId] = useState<string>("");
  const [timeMs, setTimeMs] = useState(500);
  const [points, setPoints] = useState<AutomationPoint[]>([
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: -6 },
  ]);
  const [sampled, setSampled] = useState<number | null>(null);
  const [loudness, setLoudness] = useState<LoudnessReport | null>(null);
  const [active, setActive] = useState(productionIsActive());
  const [limiter, setLimiter] = useState(false);
  const [compressor, setCompressor] = useState(false);
  const [sidechain, setSidechain] = useState(false);

  const tracks = mix?.tracks ?? [];
  const activeTrack = trackId || tracks[0]?.id || "trk-demo";

  useEffect(() => {
    return subscribeProduction(() => {
      setActive(productionIsActive());
      const o = getProductionOverlay();
      if (o) {
        setLimiter(o.limiterEnabled);
        setCompressor(o.compressorEnabled);
        setSidechain(o.sidechainEnabled);
      }
    });
  }, []);

  useEffect(() => {
    if (!mix) return;
    const o = getProductionOverlay();
    if (o?.mixId === mix.id && o.volumePointsByTrack[activeTrack]) {
      setPoints(o.volumePointsByTrack[activeTrack]!);
    }
  }, [mix?.id, activeTrack]);

  const applyAutomation = () => {
    if (!mix) return;
    patchProductionOverlay({
      mixId: mix.id,
      volumePointsByTrack: { [activeTrack]: points },
    });
    const toolkit = getProductionToolkit();
    setSampled(
      toolkit.automation.sampleAt(mix.id, activeTrack, "volume", timeMs),
    );
  };

  const applyFlags = (
    next: Partial<{ limiter: boolean; compressor: boolean; sidechain: boolean }>,
  ) => {
    if (!mix) return;
    const lim = next.limiter ?? limiter;
    const comp = next.compressor ?? compressor;
    const sc = next.sidechain ?? sidechain;
    setLimiter(lim);
    setCompressor(comp);
    setSidechain(sc);
    patchProductionOverlay({
      mixId: mix.id,
      limiterEnabled: lim,
      compressorEnabled: comp,
      sidechainEnabled: sc,
    });
  };

  const measureLoudness = () => {
    // Synthetic probe — real mix loudness is measured on export bake.
    const pcm = new Float32Array(4800);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.sin(i / 20) * 0.5;
    }
    setLoudness(
      getProductionToolkit().loudness.measurePcm(pcm, 48000, "ebu_r128"),
    );
  };

  const honesty = useMemo(
    () =>
      active
        ? t("phase3.mix.wiredActive")
        : t("phase3.mix.wiredIdle"),
    [active],
  );

  return (
    <section className="phase3-panel phase3-mix" aria-labelledby="phase3-mix-title">
      <h2 id="phase3-mix-title">{t("phase3.mix.title")}</h2>
      <p className="hint">{t("phase3.mix.intro")}</p>
      <p className="hint">{honesty}</p>

      {!mix ? (
        <p className="hint">{t("phase3.mix.needMix")}</p>
      ) : (
        <>
          <label>
            {t("phase3.mix.track")}
            <select
              value={activeTrack}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {tracks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("phase3.mix.timeMs")}
            <input
              type="number"
              min={0}
              value={timeMs}
              onChange={(e) => setTimeMs(Number(e.target.value) || 0)}
            />
          </label>
          <label>
            {t("phase3.mix.pointEndDb")}
            <input
              type="number"
              step={0.5}
              value={points[1]?.value ?? -6}
              onChange={(e) =>
                setPoints([
                  { timeMs: 0, value: 0 },
                  { timeMs: 1000, value: Number(e.target.value) },
                ])
              }
            />
          </label>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={limiter}
              onChange={(e) => applyFlags({ limiter: e.target.checked })}
            />
            {t("phase3.mix.limiter")}
          </label>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={compressor}
              onChange={(e) => applyFlags({ compressor: e.target.checked })}
            />
            {t("phase3.mix.compressor")}
          </label>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={sidechain}
              onChange={(e) => applyFlags({ sidechain: e.target.checked })}
            />
            {t("phase3.mix.sidechain")}
          </label>
          <div className="btn-row">
            <button type="button" className="btn" onClick={applyAutomation}>
              {t("phase3.mix.applyAutomation")}
            </button>
            <button type="button" className="btn" onClick={measureLoudness}>
              {t("phase3.mix.runLimiterMeter")}
            </button>
          </div>
          {sampled != null && (
            <p>
              {t("phase3.mix.sampled")}: <strong>{sampled.toFixed(2)} dB</strong>
            </p>
          )}
          {loudness && (
            <p>
              {t("phase3.mix.loudness")}:{" "}
              {loudness.integratedLufs?.toFixed(1) ?? "—"} LUFS ·{" "}
              {t("phase3.mix.truePeak")}:{" "}
              {loudness.truePeakDbfs?.toFixed(1) ?? "—"} dBFS
              <br />
              <span className="hint">{t("phase3.mix.loudnessNote")}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
