import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyMixPreset,
  applyStemBalanceProposals,
  listMixPresets,
  loudnessMatchGainDb,
  measureLoudnessFromPcm,
  measurePlanarStemLevel,
  proposeStemBalance,
  type AutoBalanceResult,
  type MixPresetDefinition,
  type TrackEffectSlot,
} from "@song-maker/mix-production";
import { bakeMixPcm, decodeMixStems } from "../lib/mixBridge";
import {
  ensureProductionOverlay,
  getProductionOverlay,
  getProductionToolkit,
  patchProductionOverlay,
  setProductionOverlay,
  type ProductionOverlay,
} from "../lib/productionState";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { t } from "../ui/i18n";
import { ErrorNotice } from "./ErrorNotice";

type Props = {
  mix: MixDoc;
  sources: PlaybackSources | null;
  /** Persist mix (pushes undo). */
  onCommitMix: (next: MixDoc) => void;
  /**
   * Temporary listen mix without persisting.
   * Pass null to exit preview and return to the committed mix.
   */
  onPreviewMix: (next: MixDoc | null) => void;
  /** Which mix is currently audible (committed or preview). */
  listeningMix: MixDoc;
};

type MixSnapshot = {
  mix: MixDoc;
  overlay: ProductionOverlay | null;
};

type AbSide = "current" | "proposed";

function cloneOverlay(overlay: ProductionOverlay | null): ProductionOverlay | null {
  if (!overlay) return null;
  return JSON.parse(JSON.stringify(overlay)) as ProductionOverlay;
}

function cloneMix(mix: MixDoc): MixDoc {
  return JSON.parse(JSON.stringify(mix)) as MixDoc;
}

function presetTitle(preset: MixPresetDefinition): string {
  const key = `mix.presets.${preset.labelKey}` as const;
  return t(key as Parameters<typeof t>[0]);
}

function presetBlurb(preset: MixPresetDefinition): string {
  const key = `mix.presets.${preset.labelKey}.blurb` as const;
  return t(key as Parameters<typeof t>[0]);
}

function presetTouchesLabel(preset: MixPresetDefinition): string {
  const parts: string[] = [];
  if (preset.touches.includes("gain")) parts.push(t("mix.presets.touch.gain"));
  if (preset.touches.includes("pan")) parts.push(t("mix.presets.touch.pan"));
  if (preset.touches.includes("effects")) parts.push(t("mix.presets.touch.effects"));
  return parts.join(" · ");
}

function balanceNoteLabel(
  note: AutoBalanceResult["proposals"][number]["note"],
): string {
  switch (note) {
    case "balanced":
      return t("mix.balance.note.balanced");
    case "silent":
      return t("mix.balance.note.silent");
    case "custom":
      return t("mix.balance.note.custom");
    case "unknown_role":
      return t("mix.balance.note.unknown");
    case "clamped":
      return t("mix.balance.note.clamped");
    default: {
      const _exhaustive: never = note;
      return String(_exhaustive);
    }
  }
}

function formatDb(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} dB`;
}

/**
 * Intent presets (#77) + automatic stem balance proposal (#78).
 * Shown only when a stem mix exists.
 */
export function MixAssistPanel({
  mix,
  sources,
  onCommitMix,
  onPreviewMix,
  listeningMix,
}: Props) {
  const presets = useMemo(() => listMixPresets(), []);
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0]?.id ?? "");
  const [presetSnapshot, setPresetSnapshot] = useState<MixSnapshot | null>(null);
  const [presetStatus, setPresetStatus] = useState<string | null>(null);

  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceResult, setBalanceResult] = useState<AutoBalanceResult | null>(
    null,
  );
  const [balanceBaseMix, setBalanceBaseMix] = useState<MixDoc | null>(null);
  const [abSide, setAbSide] = useState<AbSide>("current");
  const [matchGainDb, setMatchGainDb] = useState(0);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureForceMixBalanceConfirm = () => {
      const proposals = mix.tracks.slice(0, Math.min(3, mix.tracks.length)).map((tr) => ({
        trackId: tr.id,
        role: tr.role,
        currentGainDb: tr.gainDb,
        proposedGainDb: tr.gainDb - 1.5,
        deltaDb: -1.5,
        measured: {
          trackId: tr.id,
          role: tr.role,
          rmsDb: -18,
          peakDb: -6,
          silent: false,
          frameCount: 1000,
        },
        note: "balanced" as const,
      }));
      setBalanceResult({
        proposals,
        estimatedBusPeakDb: -3,
        masterTrimDb: 0,
        limitedBoost: true,
      });
      setBalanceBaseMix(cloneMix(mix));
      setAbSide("proposed");
      setMatchGainDb(0);
    };
    return () => {
      delete window.__captureForceMixBalanceConfirm;
    };
  }, [mix]);

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null;
  const hasStems =
    sources?.mode === "stems" && (sources.stems?.length ?? 0) > 0;

  const applyPresetEffects = useCallback(
    (mixId: string, effectsByTrack: Record<string, TrackEffectSlot[]>) => {
      ensureProductionOverlay(mixId);
      if (Object.keys(effectsByTrack).length === 0) return;
      patchProductionOverlay({ mixId, effectsByTrack });
    },
    [],
  );

  const applyPreset = () => {
    if (!selectedPreset) return;
    ensureProductionOverlay(mix.id);
    const before: MixSnapshot = {
      mix: cloneMix(mix),
      overlay: cloneOverlay(getProductionOverlay()),
    };
    const applied = applyMixPreset(mix, selectedPreset.id);
    setPresetSnapshot(before);
    onPreviewMix(null);
    onCommitMix(applied.mix);
    applyPresetEffects(applied.mix.id, applied.effectsByTrack);
    const skipped =
      applied.skippedRoles.length > 0
        ? t("mix.presets.skipped", {
            roles: applied.skippedRoles.join(", "),
          })
        : "";
    setPresetStatus(
      [t("mix.presets.applied", { name: presetTitle(selectedPreset) }), skipped]
        .filter(Boolean)
        .join(" "),
    );
  };

  const restorePreset = () => {
    if (!presetSnapshot) return;
    onPreviewMix(null);
    onCommitMix(cloneMix(presetSnapshot.mix));
    if (presetSnapshot.overlay) {
      setProductionOverlay(cloneOverlay(presetSnapshot.overlay));
    } else {
      setProductionOverlay({
        mixId: presetSnapshot.mix.id,
        volumePointsByTrack: {},
        panPointsByTrack: {},
        automationLanes: {},
        effectsByTrack: {},
        sidechainRoutes: [],
        buses: [],
        sends: [],
        trackGroupIds: {},
      });
    }
    setPresetSnapshot(null);
    setPresetStatus(t("mix.presets.restored"));
  };

  const proposedMix = useMemo(() => {
    if (!balanceResult || !balanceBaseMix) return null;
    return applyStemBalanceProposals(balanceBaseMix, balanceResult.proposals);
  }, [balanceResult, balanceBaseMix]);

  const runBalanceAnalysis = async () => {
    setBalanceError(null);
    setBalanceResult(null);
    setBalanceBaseMix(null);
    setAbSide("current");
    setMatchGainDb(0);
    onPreviewMix(null);
    if (!hasStems || !sources) {
      setBalanceError(t("mix.balance.needStems"));
      return;
    }
    setBalanceBusy(true);
    try {
      const { stems } = await decodeMixStems(sources, mix);
      const measurements = mix.tracks.map((tr) => {
        const stem = stems.find((s) => s.trackId === tr.id);
        if (!stem) {
          return measurePlanarStemLevel(
            tr.id,
            tr.role,
            new Float32Array(0),
            new Float32Array(0),
          );
        }
        return measurePlanarStemLevel(
          tr.id,
          tr.role,
          stem.left,
          stem.right,
        );
      });
      const result = proposeStemBalance({
        tracks: mix.tracks,
        measurements,
        stems,
      });
      setBalanceBaseMix(cloneMix(mix));
      setBalanceResult(result);

      // Loudness-matched A/B preview gain (proposed vs current).
      const toolkit = getProductionToolkit();
      const currentBake = bakeMixPcm(mix, stems, toolkit);
      const proposedDoc = applyStemBalanceProposals(mix, result.proposals);
      const proposedBake = bakeMixPcm(proposedDoc, stems, toolkit);
      const sr = mix.sampleRate || stems[0]?.sampleRate || 48000;
      const curL = measureLoudnessFromPcm(currentBake.pcm, sr);
      const propL = measureLoudnessFromPcm(proposedBake.pcm, sr);
      setMatchGainDb(
        loudnessMatchGainDb(curL.integratedLufs, propL.integratedLufs),
      );
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : String(e));
    } finally {
      setBalanceBusy(false);
    }
  };

  const listenAb = (side: AbSide) => {
    if (!balanceBaseMix || !proposedMix) return;
    setAbSide(side);
    if (side === "current") {
      onPreviewMix(null);
      return;
    }
    const matched: MixDoc = {
      ...proposedMix,
      masterGainDb: proposedMix.masterGainDb + matchGainDb,
    };
    onPreviewMix(matched);
  };

  const confirmBalance = () => {
    if (!proposedMix || !balanceBaseMix) return;
    // Commit without the temporary match gain on master.
    onPreviewMix(null);
    onCommitMix(cloneMix(proposedMix));
    setBalanceResult(null);
    setBalanceBaseMix(null);
    setAbSide("current");
    setMatchGainDb(0);
  };

  const cancelBalance = () => {
    onPreviewMix(null);
    setBalanceResult(null);
    setBalanceBaseMix(null);
    setAbSide("current");
    setMatchGainDb(0);
  };

  const listeningIsPreview = listeningMix !== mix;

  return (
    <section className="mix-assist" aria-label={t("mix.assist.title")}>
      <h3 className="mix-assist-title">{t("mix.assist.title")}</h3>
      <p className="hint">{t("mix.assist.intro")}</p>

      <div className="mix-assist-block">
        <h4>{t("mix.presets.title")}</h4>
        <p className="hint">{t("mix.presets.intro")}</p>
        <div className="mix-preset-list" role="list">
          {presets.map((preset) => (
            <label key={preset.id} className="mix-preset-card" role="listitem">
              <input
                type="radio"
                name="mix-preset"
                value={preset.id}
                checked={selectedPresetId === preset.id}
                onChange={() => setSelectedPresetId(preset.id)}
              />
              <span className="mix-preset-card-body">
                <strong>{presetTitle(preset)}</strong>
                <span className="hint">{presetBlurb(preset)}</span>
                <span className="mix-preset-touches">
                  {presetTouchesLabel(preset)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={!selectedPreset}
            onClick={applyPreset}
          >
            {t("mix.presets.apply")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!presetSnapshot}
            onClick={restorePreset}
          >
            {t("mix.presets.restore")}
          </button>
        </div>
        {presetStatus && <p className="hint ok">{presetStatus}</p>}
        <p className="hint">{t("mix.presets.honesty")}</p>
      </div>

      <div className="mix-assist-block">
        <h4>{t("mix.balance.title")}</h4>
        <p className="hint">{t("mix.balance.intro")}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={balanceBusy || !hasStems}
            onClick={() => void runBalanceAnalysis()}
          >
            {balanceBusy
              ? t("mix.balance.analyzing")
              : t("mix.balance.analyze")}
          </button>
        </div>
        {!hasStems && <p className="hint">{t("mix.balance.needStems")}</p>}
        {balanceError && <ErrorNotice message={balanceError} />}

        {balanceResult && proposedMix && (
          <>
            <table className="mix-balance-table">
              <thead>
                <tr>
                  <th>{t("mix.balance.col.track")}</th>
                  <th>{t("mix.balance.col.rms")}</th>
                  <th>{t("mix.balance.col.peak")}</th>
                  <th>{t("mix.balance.col.current")}</th>
                  <th>{t("mix.balance.col.proposed")}</th>
                  <th>{t("mix.balance.col.note")}</th>
                </tr>
              </thead>
              <tbody>
                {balanceResult.proposals.map((p) => {
                  const name =
                    mix.tracks.find((tr) => tr.id === p.trackId)?.name ??
                    p.trackId;
                  return (
                    <tr key={p.trackId}>
                      <td>{name}</td>
                      <td>{formatDb(p.measured.rmsDb)}</td>
                      <td>{formatDb(p.measured.peakDb)}</td>
                      <td>{formatDb(p.currentGainDb)}</td>
                      <td>{formatDb(p.proposedGainDb)}</td>
                      <td>{balanceNoteLabel(p.note)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="hint">
              {t("mix.balance.busPeak", {
                peak: formatDb(balanceResult.estimatedBusPeakDb),
              })}
              {balanceResult.limitedBoost
                ? ` — ${t("mix.balance.limitedBoost")}`
                : ""}
            </p>
            <p className="hint">
              {t("mix.balance.matchGain", { gain: formatDb(matchGainDb) })}
            </p>
            <div className="btn-row" role="group" aria-label={t("mix.balance.ab")}>
              <button
                type="button"
                className={abSide === "current" ? "btn active" : "btn"}
                onClick={() => listenAb("current")}
              >
                {t("mix.balance.listenCurrent")}
              </button>
              <button
                type="button"
                className={abSide === "proposed" ? "btn active" : "btn"}
                onClick={() => listenAb("proposed")}
              >
                {t("mix.balance.listenProposed")}
              </button>
            </div>
            {listeningIsPreview && (
              <p className="hint ok">{t("mix.balance.previewActive")}</p>
            )}
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                onClick={confirmBalance}
              >
                {t("mix.balance.confirm")}
              </button>
              <button type="button" className="btn" onClick={cancelBalance}>
                {t("mix.balance.cancel")}
              </button>
            </div>
            <p className="hint">{t("mix.balance.honesty")}</p>
          </>
        )}
      </div>
    </section>
  );
}

declare global {
  interface Window {
    __captureForceMixBalanceConfirm?: () => void;
  }
}
