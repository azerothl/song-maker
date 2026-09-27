import { useMemo, useState } from "react";
import {
  createMixProductionToolkit,
  type AutomationPoint,
  type LoudnessReport,
} from "@song-maker/mix-production";
import type { MixDoc } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  mix: MixDoc | null;
};

/**
 * Phase 3 production panel — real automation sampling + loudness / limiter demo
 * on synthetic PCM (does not replace the phase-1 offline mix renderer).
 */
export function Phase3MixPanel({ mix }: Props) {
  const toolkit = useMemo(() => createMixProductionToolkit(), []);
  const [trackId, setTrackId] = useState<string>("");
  const [timeMs, setTimeMs] = useState(500);
  const [points, setPoints] = useState<AutomationPoint[]>([
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: -6 },
  ]);
  const [sampled, setSampled] = useState<number | null>(null);
  const [loudness, setLoudness] = useState<LoudnessReport | null>(null);
  const [limiterPeak, setLimiterPeak] = useState<string | null>(null);

  const tracks = mix?.tracks ?? [];
  const activeTrack = trackId || tracks[0]?.id || "trk-demo";

  const runAutomation = () => {
    if (!mix) return;
    toolkit.automation.setLane(mix.id, {
      trackId: activeTrack,
      target: "volume",
      points,
    });
    setSampled(
      toolkit.automation.sampleAt(mix.id, activeTrack, "volume", timeMs),
    );
  };

  const runLoudnessAndLimiter = () => {
    // Synthetic hot signal to prove limiter + meter actually run.
    const pcm = new Float32Array(4800);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.sin(i / 20) * 0.95;
    }
    toolkit.effects.insert("trk-demo-lim", {
      id: "lim-1",
      kind: "limiter",
      enabled: true,
      params: { ceilingDb: -1 },
    });
    const limited = toolkit.effects.process("trk-demo-lim", pcm);
    const before = Math.max(...pcm.map(Math.abs));
    const after = Math.max(...limited.map(Math.abs));
    setLimiterPeak(
      `${t("phase3.mix.peakBefore")} ${before.toFixed(3)} → ${t("phase3.mix.peakAfter")} ${after.toFixed(3)}`,
    );
    setLoudness(toolkit.loudness.measurePcm(limited, 48000, "ebu_r128"));
  };

  return (
    <section className="phase3-panel phase3-mix" aria-labelledby="phase3-mix-title">
      <h2 id="phase3-mix-title">{t("phase3.mix.title")}</h2>
      <p className="hint">{t("phase3.mix.intro")}</p>

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
          <div className="btn-row">
            <button type="button" className="btn" onClick={runAutomation}>
              {t("phase3.mix.sampleAutomation")}
            </button>
            <button type="button" className="btn" onClick={runLoudnessAndLimiter}>
              {t("phase3.mix.runLimiterMeter")}
            </button>
          </div>
          {sampled != null && (
            <p>
              {t("phase3.mix.sampled")}: <strong>{sampled.toFixed(2)} dB</strong>
            </p>
          )}
          {limiterPeak && <p className="hint">{limiterPeak}</p>}
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
