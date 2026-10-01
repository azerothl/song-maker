import { useId, useMemo, type RefObject } from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { ParametricEqBandFields } from "./ParametricEqBandFields";
import { t } from "../../ui/i18n";
import { useTrackEffects } from "../../lib/useTrackEffects";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  mixId: string;
  trackId: string;
  trackName: string;
};

export function ProductionParametricEqPopin({
  open,
  onClose,
  anchorRef,
  mixId,
  trackId,
  trackName,
}: Props) {
  const titleId = useId();
  const { effects, updateEffectParam } = useTrackEffects(mixId, trackId);

  const paramEq = useMemo(
    () => effects.find((e) => e.kind === "parametricEq") ?? null,
    [effects],
  );

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="production-eq-popin"
    >
      <header className="anchored-popin-header">
        <h3 id={titleId}>
          {t("production.eq.popover", { track: trackName })}
        </h3>
        <button type="button" className="btn" onClick={onClose}>
          {t("production.eq.popover.close")}
        </button>
      </header>
      {!paramEq ? (
        <p className="hint">{t("production.eq.missing")}</p>
      ) : (
        <ParametricEqBandFields
          fx={paramEq}
          updateEffectParam={(key, value) =>
            updateEffectParam(paramEq.id, key, value)
          }
        />
      )}
    </AnchoredPopin>
  );
}
