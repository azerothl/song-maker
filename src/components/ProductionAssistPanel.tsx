import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loudnessMatchGainDb,
  measureLoudnessFromPcm,
  measurePlanarStemLevel,
  type StemLevelMeasurement,
  type TrackEffectSlot,
} from "@song-maker/mix-production";
import { ErrorNotice } from "./ErrorNotice";
import { bakeMixPcm, decodeMixStems, type DecodedStem } from "../lib/mixBridge";
import {
  analyzeProduction,
  applySelectedProposals,
  fingerprintProductionState,
  previewMixFromProposals,
  type ProductionAnalysis,
  type ProductionProposal,
} from "../lib/productionAssistant";
import {
  ensureProductionOverlay,
  getProductionOverlay,
  getProductionToolkit,
  patchProductionOverlay,
  setProductionOverlay,
  type ProductionOverlay,
} from "../lib/productionState";
import type { ScoreIssue } from "../lib/score";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { t } from "../ui/i18n";

type Props = {
  mix: MixDoc;
  sources: PlaybackSources | null;
  scoreIssues?: readonly ScoreIssue[];
  listeningMix: MixDoc;
  onCommitMix: (next: MixDoc) => void;
  onPreviewMix: (next: MixDoc | null) => void;
  onSaveMixVersion?: () => Promise<void> | void;
};

type Snapshot = {
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

function formatDb(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)} dB`;
}

/**
 * Production copilote (#97): local analysis → reversible structured proposals.
 * Never mutates until explicit confirm; rejects stale fingerprints.
 */
export function ProductionAssistPanel({
  mix,
  sources,
  scoreIssues,
  listeningMix,
  onCommitMix,
  onPreviewMix,
  onSaveMixVersion,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProductionAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [abSide, setAbSide] = useState<AbSide>("current");
  const [matchGainDb, setMatchGainDb] = useState(0);

  useEffect(() => {
    if (!import.meta.env.VITE_CAPTURE) return;
    window.__captureForceCopilotConfirm = () => {
      ensureProductionOverlay(mix.id);
      const fingerprint = fingerprintProductionState(mix, getProductionOverlay());
      const id = "capture-copilot-prop";
      setAnalysis({
        mixId: mix.id,
        fingerprint,
        analyzedAtIso: new Date().toISOString(),
        proposals: [
          {
            id,
            kind: "save_mix_version",
            titleFr: "Enregistrer une version (capture)",
            findingFr: "Proposition de capture pour contraste primaire.",
            expectedFr: "Confirmer sans backend audio.",
            changes: [{ type: "save_version" }],
            previewable: false,
            autoApplicable: true,
            selectedByDefault: true,
          },
        ],
        balanceResult: null,
        remoteAnalysis: false,
        limitsFr: "Harness capture #186 — pas d'analyse réelle.",
      });
      setSelected(new Set([id]));
      setError(null);
      setStatus(null);
    };
    return () => {
      delete window.__captureForceCopilotConfirm;
    };
  }, [mix]);

  const hasStems =
    sources?.mode === "stems" && (sources.stems?.length ?? 0) > 0;

  const currentFingerprint = useMemo(() => {
    void mix.masterGainDb;
    void mix.tracks;
    return fingerprintProductionState(mix, getProductionOverlay());
  }, [mix]);

  const applyEffects = useCallback(
    (mixId: string, effectsByTrack: Record<string, TrackEffectSlot[]>) => {
      ensureProductionOverlay(mixId);
      if (Object.keys(effectsByTrack).length === 0) return;
      patchProductionOverlay({ mixId, effectsByTrack });
    },
    [],
  );

  const clearSession = () => {
    onPreviewMix(null);
    setAnalysis(null);
    setSelected(new Set());
    setAbSide("current");
    setMatchGainDb(0);
    setError(null);
  };

  const runAnalysis = async () => {
    setError(null);
    setStatus(null);
    clearSession();
    setBusy(true);
    try {
      ensureProductionOverlay(mix.id);
      const overlay = getProductionOverlay();
      let measurements: StemLevelMeasurement[] | undefined;
      let stems: DecodedStem[] | undefined;
      if (hasStems && sources) {
        const decoded = await decodeMixStems(sources, mix);
        stems = decoded.stems;
        measurements = mix.tracks.map((tr) => {
          const stem = stems!.find((s) => s.trackId === tr.id);
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
      }
      const next = analyzeProduction({
        mix,
        overlay,
        measurements,
        stems,
        scoreIssues,
      });
      setAnalysis(next);
      setSelected(
        new Set(
          next.proposals.filter((p) => p.selectedByDefault).map((p) => p.id),
        ),
      );

      if (next.balanceResult && stems) {
        const preview = previewMixFromProposals(mix, next, [
          "rebalance_stems",
        ]);
        if (preview) {
          const toolkit = getProductionToolkit();
          const currentBake = bakeMixPcm(mix, stems, toolkit);
          const proposedBake = bakeMixPcm(preview, stems, toolkit);
          const sr = mix.sampleRate || stems[0]?.sampleRate || 48000;
          const curL = measureLoudnessFromPcm(currentBake.pcm, sr);
          const propL = measureLoudnessFromPcm(proposedBake.pcm, sr);
          setMatchGainDb(
            loudnessMatchGainDb(curL.integratedLufs, propL.integratedLufs),
          );
        }
      }

      if (next.proposals.length === 0) {
        setStatus(t("copilot.empty"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleProposal = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAbSide("current");
    onPreviewMix(null);
  };

  const listenAb = (side: AbSide) => {
    if (!analysis) return;
    setAbSide(side);
    if (side === "current") {
      onPreviewMix(null);
      return;
    }
    const proposed = previewMixFromProposals(
      mix,
      analysis,
      [...selected],
    );
    if (!proposed) {
      setError(t("copilot.previewUnavailable"));
      return;
    }
    onPreviewMix({
      ...proposed,
      masterGainDb: proposed.masterGainDb + matchGainDb,
    });
  };

  const confirmApply = async () => {
    if (!analysis) return;
    setError(null);
    const fp = fingerprintProductionState(mix, getProductionOverlay());
    const result = applySelectedProposals({
      mix,
      overlay: getProductionOverlay(),
      analysis,
      selectedIds: [...selected],
      currentFingerprint: fp,
    });
    if (!result.ok) {
      setError(result.reasonFr);
      onPreviewMix(null);
      return;
    }

    setSnapshot({
      mix: cloneMix(mix),
      overlay: cloneOverlay(getProductionOverlay()),
    });
    onPreviewMix(null);
    onCommitMix(cloneMix(result.mix));
    applyEffects(result.mix.id, result.effectsByTrack);
    setStatus(result.messageFr);
    setAnalysis(null);
    setSelected(new Set());
    setAbSide("current");

    if (result.wantSaveVersion && onSaveMixVersion) {
      try {
        await onSaveMixVersion();
        setStatus(
          `${result.messageFr} ${t("copilot.versionSaved")}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const restoreSnapshot = () => {
    if (!snapshot) return;
    onPreviewMix(null);
    onCommitMix(cloneMix(snapshot.mix));
    if (snapshot.overlay) {
      setProductionOverlay(cloneOverlay(snapshot.overlay));
    } else {
      setProductionOverlay({
        mixId: snapshot.mix.id,
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
    setSnapshot(null);
    setStatus(t("copilot.restored"));
  };

  const stale =
    analysis !== null && analysis.fingerprint !== currentFingerprint;
  const listeningIsPreview = listeningMix !== mix;
  const hasPreviewable =
    analysis?.proposals.some(
      (p) => p.previewable && selected.has(p.id),
    ) ?? false;

  return (
    <section className="mix-assist production-copilot" aria-label={t("copilot.title")}>
      <h3 className="mix-assist-title">{t("copilot.title")}</h3>
      <p className="hint">{t("copilot.intro")}</p>
      <p className="hint">{t("copilot.localOnly")}</p>

      <div className="btn-row">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void runAnalysis()}
        >
          {busy ? t("copilot.analyzing") : t("copilot.analyze")}
        </button>
        {snapshot && (
          <button type="button" className="btn" onClick={restoreSnapshot}>
            {t("copilot.restore")}
          </button>
        )}
      </div>

      {!hasStems && (
        <p className="hint">{t("copilot.needStemsHint")}</p>
      )}
      {error && <ErrorNotice message={error} />}
      {status && <p className="hint ok">{status}</p>}
      {stale && (
        <p className="hint error">{t("copilot.stale")}</p>
      )}

      {analysis && analysis.proposals.length > 0 && (
        <div className="mix-assist-block">
          <h4>{t("copilot.proposals")}</h4>
          <ul className="production-copilot-list">
            {analysis.proposals.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                checked={selected.has(p.id)}
                onToggle={() => toggleProposal(p.id)}
              />
            ))}
          </ul>

          {hasPreviewable && !stale && (
            <>
              <p className="hint">
                {t("copilot.matchGain", { gain: formatDb(matchGainDb) })}
              </p>
              <div
                className="btn-row"
                role="group"
                aria-label={t("copilot.ab")}
              >
                <button
                  type="button"
                  className={abSide === "current" ? "btn active" : "btn"}
                  onClick={() => listenAb("current")}
                >
                  {t("copilot.listenCurrent")}
                </button>
                <button
                  type="button"
                  className={abSide === "proposed" ? "btn active" : "btn"}
                  onClick={() => listenAb("proposed")}
                >
                  {t("copilot.listenProposed")}
                </button>
              </div>
              {listeningIsPreview && (
                <p className="hint ok">{t("copilot.previewActive")}</p>
              )}
            </>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              disabled={stale}
              onClick={() => void confirmApply()}
            >
              {t("copilot.confirm")}
            </button>
            <button type="button" className="btn" onClick={clearSession}>
              {t("copilot.cancel")}
            </button>
          </div>
          <p className="hint">{analysis.limitsFr}</p>
        </div>
      )}
    </section>
  );
}

function ProposalRow({
  proposal,
  checked,
  onToggle,
}: {
  proposal: ProductionProposal;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="production-copilot-item">
      <label className="production-copilot-label">
        <input
          type="checkbox"
          checked={checked}
          disabled={!proposal.autoApplicable && proposal.kind !== "save_mix_version"}
          onChange={onToggle}
        />
        <span>
          <strong>{proposal.titleFr}</strong>
          <br />
          <span className="hint">{proposal.findingFr}</span>
          <br />
          <span className="hint">{proposal.expectedFr}</span>
          {proposal.changes.length > 0 && (
            <ul className="production-copilot-changes">
              {proposal.changes.map((c, i) => (
                <li key={i}>{describeChange(c)}</li>
              ))}
            </ul>
          )}
          {!proposal.autoApplicable && proposal.kind === "score_fix_hint" && (
            <span className="hint">{t("copilot.scoreHintOnly")}</span>
          )}
        </span>
      </label>
    </li>
  );
}

function describeChange(
  change: ProductionProposal["changes"][number],
): string {
  switch (change.type) {
    case "gain":
      return `${change.trackName}: ${formatDb(change.fromDb)} → ${formatDb(change.toDb)}`;
    case "master_trim":
      return `Master: ${formatDb(change.fromDb)} → ${formatDb(change.toDb)}`;
    case "preset":
      return `Preset ${change.presetId} (${change.touches.join(", ")})`;
    case "effects":
      return `${change.trackName}: ${change.effects.map((e) => e.kind).join(", ")}`;
    case "score_hint":
      return `${change.issueCode}: ${change.hintFr}`;
    case "save_version":
      return t("copilot.change.saveVersion");
    default: {
      const _exhaustive: never = change;
      return String(_exhaustive);
    }
  }
}

declare global {
  interface Window {
    __captureForceCopilotConfirm?: () => void;
  }
}
