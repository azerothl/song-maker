import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { ProductionTrackSettingsPopin } from "./ProductionTrackSettingsPopin";
import { ProductionTrackFxLinePopin } from "./ProductionTrackFxLinePopin";
import { ProductionParametricEqPopin } from "./ProductionParametricEqPopin";
import { isPitchCorrectEligibleTrack } from "../../lib/productionState";
import {
  isTrackAutomationVisible,
  setTrackAutomationVisible,
} from "../../lib/productionTrackAutomationVisible";
import type { MixDoc, MixTrack } from "../../lib/types";
import { t } from "../../ui/i18n";

type TrackTab = "eq" | "fx" | "automation" | "settings";

type Props = {
  track: MixTrack;
  mix: MixDoc;
  scheduleMixUpdate: (next: MixDoc, opts?: { persist?: boolean }) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tempoBpm?: number | null;
};

/**
 * Track tools — single popover with tabs (maquette / #226), not a popover chain.
 * Settings (fondus / M-S) stay available as a fourth tab for existing controls.
 */
export function ProductionTrackTools({
  track,
  mix,
  scheduleMixUpdate,
  isOpen,
  onOpenChange,
  tempoBpm,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tablistId = useId();
  const [tab, setTab] = useState<TrackTab>("settings");
  const [autoVisible, setAutoVisible] = useState(() =>
    isTrackAutomationVisible(track.id),
  );

  useEffect(() => {
    if (!isOpen) setTab("settings");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setAutoVisible(isTrackAutomationVisible(track.id));
  }, [isOpen, track.id]);

  const closeAll = () => onOpenChange(false);
  const popinAnchor: RefObject<HTMLElement | null> = btnRef;

  const tabs: { id: TrackTab; label: string }[] = [
    { id: "eq", label: t("production.track.tab.eq") },
    { id: "fx", label: t("production.track.tab.fx") },
    { id: "automation", label: t("production.track.tab.automation") },
    { id: "settings", label: t("production.track.tab.settings") },
  ];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn production-track-tools-btn"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t("production.track.tools", { track: track.name })}
        onClick={() => {
          if (isOpen) closeAll();
          else onOpenChange(true);
        }}
      >
        <span aria-hidden>⇄</span>
      </button>

      <AnchoredPopin
        open={isOpen}
        onClose={closeAll}
        anchorRef={popinAnchor}
        labelId={titleId}
        className="production-track-detail-popin"
      >
        <header className="anchored-popin-header">
          <h3 id={titleId}>
            {t("production.track.popover", { track: track.name })}
          </h3>
          <button type="button" className="btn" onClick={closeAll}>
            {t("production.track.close")}
          </button>
        </header>

        <div
          className="production-track-tabs"
          role="tablist"
          aria-label={t("production.track.tabs")}
          id={tablistId}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className="btn production-track-tab"
              id={`${tablistId}-${item.id}`}
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-${tab}`}
          hidden={tab !== "eq"}
        >
          {tab === "eq" ? (
            <ProductionParametricEqPopin
              open
              onClose={closeAll}
              anchorRef={popinAnchor}
              mixId={mix.id}
              trackId={track.id}
              trackName={track.name}
              embedded
            />
          ) : null}
        </div>
        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-fx`}
          hidden={tab !== "fx"}
        >
          {tab === "fx" ? (
            <ProductionTrackFxLinePopin
              open
              onClose={closeAll}
              anchorRef={popinAnchor}
              mixId={mix.id}
              trackId={track.id}
              trackName={track.name}
              tempoBpm={tempoBpm}
              canAddPitchCorrect={isPitchCorrectEligibleTrack(track.role)}
              onOpenEq={() => setTab("eq")}
              embedded
            />
          ) : null}
        </div>
        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-automation`}
          hidden={tab !== "automation"}
        >
          {tab === "automation" ? (
            <div className="production-track-auto-panel">
              <button
                type="button"
                className="btn production-track-auto-toggle"
                aria-pressed={autoVisible}
                aria-expanded={autoVisible}
                aria-controls={`production-auto-${encodeURIComponent(track.id)}`}
                disabled={track.locked}
                title={track.locked ? t("production.auto.locked") : undefined}
                onClick={() => {
                  const next = !autoVisible;
                  setAutoVisible(next);
                  setTrackAutomationVisible(track.id, next);
                }}
              >
                {t("production.track.showAuto")}
              </button>
              {track.locked && (
                <p className="hint">{t("production.auto.locked")}</p>
              )}
              <p className="hint">{t("production.track.auto.hint")}</p>
            </div>
          ) : null}
        </div>
        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-settings`}
          hidden={tab !== "settings"}
        >
          {tab === "settings" ? (
            <ProductionTrackSettingsPopin
              open
              onClose={closeAll}
              anchorRef={popinAnchor}
              track={track}
              mix={mix}
              onMixChange={scheduleMixUpdate}
              onOpenFxLine={() => setTab("fx")}
              embedded
            />
          ) : null}
        </div>
      </AnchoredPopin>
    </>
  );
}
