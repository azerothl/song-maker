import { useId, useMemo, type RefObject } from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { PopinCloseButton } from "../PopinCloseButton";
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
  embedded?: boolean;
};

export function ProductionParametricEqPopin({
  open,
  onClose,
  anchorRef,
  mixId,
  trackId,
  trackName,
  embedded = false,
}: Props) {
  const titleId = useId();
  const { effects, updateEffectParam } = useTrackEffects(mixId, trackId);

  const paramEq = useMemo(
    () => effects.find((e) => e.kind === "parametricEq") ?? null,
    [effects],
  );

  const body = (
    <>
      {!embedded && (
      <header className="anchored-popin-header">
        <h3 id={titleId}>
          {t("production.eq.popover", { track: trackName })}
        </h3>
        <PopinCloseButton
          label={t("production.eq.popover.close")}
          onClick={onClose}
        />
      </header>
      )}
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
    </>
  );

  if (embedded) {
    if (!open) return null;
    return <div className="production-eq-embedded">{body}</div>;
  }

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="production-eq-popin"
    >
      {body}
    </AnchoredPopin>
  );
}
