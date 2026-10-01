import { useEffect, useRef, useState, type RefObject } from "react";
import { ProductionTrackSettingsPopin } from "./ProductionTrackSettingsPopin";
import { ProductionTrackFxLinePopin } from "./ProductionTrackFxLinePopin";
import { ProductionParametricEqPopin } from "./ProductionParametricEqPopin";
import { isPitchCorrectEligibleTrack } from "../../lib/productionState";
import type { MixDoc, MixTrack } from "../../lib/types";
import { t } from "../../ui/i18n";

type SubPopin = "settings" | "fx" | "eq" | null;

type Props = {
  track: MixTrack;
  mix: MixDoc;
  scheduleMixUpdate: (next: MixDoc, opts?: { persist?: boolean }) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tempoBpm?: number | null;
};

export function ProductionTrackTools({
  track,
  mix,
  scheduleMixUpdate,
  isOpen,
  onOpenChange,
  tempoBpm,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [subPopin, setSubPopin] = useState<SubPopin>(null);

  useEffect(() => {
    if (!isOpen) setSubPopin(null);
  }, [isOpen]);

  const closeAll = () => {
    setSubPopin(null);
    onOpenChange(false);
  };

  const openSettings = () => {
    setSubPopin("settings");
    onOpenChange(true);
  };

  const settingsOpen = isOpen && subPopin === "settings";
  const fxOpen = isOpen && subPopin === "fx";
  const eqOpen = isOpen && subPopin === "eq";

  const popinAnchor: RefObject<HTMLElement | null> = btnRef;

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
          else openSettings();
        }}
      >
        <span aria-hidden>⋯</span>
      </button>
      <ProductionTrackSettingsPopin
        open={settingsOpen}
        onClose={closeAll}
        anchorRef={popinAnchor}
        track={track}
        mix={mix}
        onMixChange={scheduleMixUpdate}
        onOpenFxLine={() => setSubPopin("fx")}
      />
      <ProductionTrackFxLinePopin
        open={fxOpen}
        onClose={closeAll}
        anchorRef={popinAnchor}
        mixId={mix.id}
        trackId={track.id}
        trackName={track.name}
        tempoBpm={tempoBpm}
        canAddPitchCorrect={isPitchCorrectEligibleTrack(track.role)}
        onOpenEq={() => setSubPopin("eq")}
      />
      <ProductionParametricEqPopin
        open={eqOpen}
        onClose={closeAll}
        anchorRef={popinAnchor}
        mixId={mix.id}
        trackId={track.id}
        trackName={track.name}
      />
    </>
  );
}
