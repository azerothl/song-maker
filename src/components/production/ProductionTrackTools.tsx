import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { PopinCloseButton } from "../PopinCloseButton";
import { ProductionTrackSettingsPopin } from "./ProductionTrackSettingsPopin";
import { ProductionTrackFxLinePopin } from "./ProductionTrackFxLinePopin";
import { ProductionTrackRoutingPopin } from "./ProductionTrackRoutingPopin";
import { isVocalEffectEligibleTrack } from "../../lib/productionState";
import { setTrackAutomationVisible } from "../../lib/productionTrackAutomationVisible";
import { handleRovingTabListKeyDown } from "../../lib/rovingTabList";
import type { MixDoc, MixTrack } from "../../lib/types";
import { t } from "../../ui/i18n";

type TrackTab = "fx" | "automation" | "routing" | "settings";

type Props = {
  track: MixTrack;
  mix: MixDoc;
  scheduleMixUpdate: (next: MixDoc, opts?: { persist?: boolean }) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tempoBpm?: number | null;
  onOpenMidiInstrument?: () => void;
};

/**
 * Track tools — single popover with tabs (maquette / #226), not a popover chain.
 * Settings (fondus / M-S) stay available as a fourth tab for existing controls.
 * Automation tab opens the under-track curve immediately (Loïc 2026-10-02).
 */
export function ProductionTrackTools({
  track,
  mix,
  scheduleMixUpdate,
  isOpen,
  onOpenChange,
  tempoBpm,
  onOpenMidiInstrument,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tablistId = useId();
  const [tab, setTab] = useState<TrackTab>("fx");

  useEffect(() => {
    if (!isOpen) setTab("fx");
  }, [isOpen]);

  const closeAll = () => onOpenChange(false);
  const popinAnchor: RefObject<HTMLElement | null> = btnRef;

  const openAutomationUnderTrack = () => {
    setTrackAutomationVisible(track.id, true);
    closeAll();
    requestAnimationFrame(() => {
      const lane = document.getElementById(
        `production-auto-${encodeURIComponent(track.id)}`,
      );
      lane
        ?.querySelector<HTMLElement>(".production-auto-curve")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const tabs: { id: TrackTab; label: string }[] = [
    { id: "fx", label: t("production.track.tab.fx") },
    { id: "automation", label: t("production.track.tab.automation") },
    { id: "routing", label: t("production.track.tab.routing") },
    { id: "settings", label: t("production.track.tab.settings") },
  ];

  const title =
    tab === "routing"
      ? t("production.routing.popover", { track: track.name })
      : t("production.track.popover", { track: track.name });

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
          <h3 id={titleId}>{title}</h3>
          <PopinCloseButton label={t("production.track.close")} onClick={closeAll} />
        </header>

        <div
          className="production-track-tabs"
          role="tablist"
          aria-label={t("production.track.tabs")}
          id={tablistId}
          onKeyDown={handleRovingTabListKeyDown}
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
              onClick={() => {
                if (item.id === "automation") {
                  openAutomationUnderTrack();
                  return;
                }
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-fx`}
          hidden={tab !== "fx"}
        >
          {tab === "fx" && onOpenMidiInstrument && (
            <section className="production-track-vst3" aria-label={t("production.midi.instrumentTitle")}>
              <div className="production-track-vst3-header">
                <div>
                  <h4>{t("production.midi.instrumentTitle")}</h4>
                  <p className="hint">{t("production.midi.instrumentChooseHint")}</p>
                </div>
                <button className="btn" type="button" onClick={() => {
                  closeAll();
                  onOpenMidiInstrument();
                }}>{t("production.midi.chooseVst3")}</button>
              </div>
            </section>
          )}
          {tab === "fx" ? (
            <ProductionTrackFxLinePopin
              open
              onClose={closeAll}
              anchorRef={popinAnchor}
              mixId={mix.id}
              mix={mix}
              trackId={track.id}
              trackName={track.name}
              onMixChange={(next) => scheduleMixUpdate(next)}
              tempoBpm={tempoBpm}
              canAddVocalFx={isVocalEffectEligibleTrack(track.role)}
              embedded
            />
          ) : null}
        </div>
        <div
          role="tabpanel"
          className="production-track-tabpanel"
          aria-labelledby={`${tablistId}-routing`}
          hidden={tab !== "routing"}
        >
          {tab === "routing" ? (
            <ProductionTrackRoutingPopin track={track} mix={mix} />
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
