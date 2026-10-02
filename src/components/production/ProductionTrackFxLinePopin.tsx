import {
  useEffect,
  useId,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { AnchoredPopin } from "../AnchoredPopin";
import { PopinCloseButton } from "../PopinCloseButton";
import { Phase3FxParamFields } from "./Phase3FxParamFields";
import { ParametricEqBandFields } from "./ParametricEqBandFields";
import { t } from "../../ui/i18n";
import { useTrackEffects } from "../../lib/useTrackEffects";
import {
  UI_EFFECT_KINDS,
  type UiEffectKind,
} from "../../lib/productionState";

const FX_LABEL: Record<
  UiEffectKind,
  | "phase3.mix.fx.limiter"
  | "phase3.mix.fx.compressor"
  | "phase3.mix.fx.gate"
  | "phase3.mix.fx.eq"
  | "phase3.mix.fx.parametricEq"
  | "phase3.mix.fx.filter"
  | "phase3.mix.fx.delay"
  | "phase3.mix.fx.reverb"
  | "phase3.mix.fx.pitchCorrect"
> = {
  limiter: "phase3.mix.fx.limiter",
  compressor: "phase3.mix.fx.compressor",
  gate: "phase3.mix.fx.gate",
  eq: "phase3.mix.fx.eq",
  parametricEq: "phase3.mix.fx.parametricEq",
  filter: "phase3.mix.fx.filter",
  delay: "phase3.mix.fx.delay",
  reverb: "phase3.mix.fx.reverb",
  pitch_correct: "phase3.mix.fx.pitchCorrect",
};

const FX_ADD_LABEL: Record<
  UiEffectKind,
  | "phase3.mix.add.limiter"
  | "phase3.mix.add.compressor"
  | "phase3.mix.add.gate"
  | "phase3.mix.add.eq"
  | "phase3.mix.add.parametricEq"
  | "phase3.mix.add.filter"
  | "phase3.mix.add.delay"
  | "phase3.mix.add.reverb"
  | "phase3.mix.add.pitchCorrect"
> = {
  limiter: "phase3.mix.add.limiter",
  compressor: "phase3.mix.add.compressor",
  gate: "phase3.mix.add.gate",
  eq: "phase3.mix.add.eq",
  parametricEq: "phase3.mix.add.parametricEq",
  filter: "phase3.mix.add.filter",
  delay: "phase3.mix.add.delay",
  reverb: "phase3.mix.add.reverb",
  pitch_correct: "phase3.mix.add.pitchCorrect",
};

function isUiEffectKind(kind: string): kind is UiEffectKind {
  return (UI_EFFECT_KINDS as readonly string[]).includes(kind);
}

function effectDisplayName(fx: { kind: string }): string {
  return isUiEffectKind(fx.kind) ? t(FX_LABEL[fx.kind]) : fx.kind;
}

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  mixId: string;
  trackId: string;
  trackName: string;
  tempoBpm?: number | null;
  canAddPitchCorrect?: boolean;
  grByEffect?: Record<string, number>;
  /** @deprecated EQ is configured inline in Effects (Loïc 2026-10-02). */
  onOpenEq?: () => void;
  embedded?: boolean;
};

export function ProductionTrackFxLinePopin({
  open,
  onClose,
  anchorRef,
  mixId,
  trackId,
  trackName,
  tempoBpm = null,
  canAddPitchCorrect = true,
  grByEffect,
  embedded = false,
}: Props) {
  const titleId = useId();
  const propsGroupId = useId();
  const {
    effects,
    addEffect,
    updateEffect,
    updateEffectParam,
    removeEffect,
    moveEffect,
  } = useTrackEffects(mixId, trackId, { tempoBpm, canAddPitchCorrect });

  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(
    null,
  );

  const selectedFx = useMemo(
    () => effects.find((e) => e.id === selectedEffectId) ?? null,
    [effects, selectedEffectId],
  );

  useEffect(() => {
    if (!selectedEffectId) return;
    if (!effects.some((e) => e.id === selectedEffectId)) {
      setSelectedEffectId(null);
    }
  }, [effects, selectedEffectId]);

  useEffect(() => {
    if (!open) setSelectedEffectId(null);
  }, [open]);

  const selectedLabel = selectedFx ? effectDisplayName(selectedFx) : "";

  const listBlock =
    effects.length === 0 ? (
      <p className="hint">{t("phase3.mix.fxEmpty")}</p>
    ) : (
      <ul className="phase3-fx-list production-fx-line-list" role="list">
        {effects.map((fx, index) => {
          const name = effectDisplayName(fx);
          const selected = fx.id === selectedEffectId;
          return (
            <li key={fx.id} className="phase3-fx-item">
              <div className="phase3-fx-item-head production-fx-line-row">
                <label className="phase3-check">
                  <input
                    type="checkbox"
                    checked={fx.enabled}
                    aria-label={name}
                    onChange={(e) =>
                      updateEffect(fx.id, { enabled: e.target.checked })
                    }
                  />
                </label>
                <button
                  type="button"
                  className={`btn production-fx-line-select${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedEffectId(fx.id)}
                >
                  {name}
                </button>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={index === 0}
                    aria-label={t("production.fx.moveUpNamed", {
                      effect: name,
                    })}
                    onClick={() => moveEffect(fx.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={index === effects.length - 1}
                    aria-label={t("production.fx.moveDownNamed", {
                      effect: name,
                    })}
                    onClick={() => moveEffect(fx.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label={t("production.fx.removeNamed", {
                      effect: name,
                    })}
                    onClick={() => removeEffect(fx.id)}
                  >
                    {t("production.fx.removeNamed", { effect: name })}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const propsBlock = (
    <div
      className="phase3-fields production-fx-line-props"
      role="group"
      aria-labelledby={propsGroupId}
    >
      <p id={propsGroupId} className="production-fx-line-props-title">
        {selectedFx ? selectedLabel : t("production.fx.noneSelected")}
      </p>
      {selectedFx &&
        (selectedFx.kind === "parametricEq" ? (
          <ParametricEqBandFields
            fx={selectedFx}
            updateEffectParam={(key, value) =>
              updateEffectParam(selectedFx.id, key, value)
            }
          />
        ) : (
          <Phase3FxParamFields
            fx={selectedFx}
            updateEffectParam={(key, value) =>
              updateEffectParam(selectedFx.id, key, value)
            }
            grByEffect={grByEffect}
            tempoBpm={tempoBpm}
          />
        ))}
    </div>
  );

  const body = (
    <>
      {!embedded && (
        <header className="anchored-popin-header">
          <h3 id={titleId}>
            {t("production.fx.line.title", { track: trackName })}
          </h3>
          <PopinCloseButton
            label={t("production.fx.line.close")}
            onClick={onClose}
          />
        </header>
      )}

      <div className="production-fx-line-columns">
        <div className="production-fx-line-col-list">{listBlock}</div>
        <div className="production-fx-line-col-props">{propsBlock}</div>
      </div>

      <div className="btn-row production-fx-line-add">
        {UI_EFFECT_KINDS.map((kind) => {
          const disabled = kind === "pitch_correct" && !canAddPitchCorrect;
          return (
            <button
              key={kind}
              type="button"
              className="btn"
              disabled={disabled}
              title={
                disabled ? t("phase3.mix.pitchCorrect.vocalsOnly") : undefined
              }
              onClick={() => addEffect(kind)}
            >
              {t(FX_ADD_LABEL[kind])}
            </button>
          );
        })}
      </div>
      {!canAddPitchCorrect && (
        <p className="hint">{t("phase3.mix.pitchCorrect.vocalsOnly")}</p>
      )}
    </>
  );

  if (embedded) {
    if (!open) return null;
    return <div className="production-fx-line-embedded">{body}</div>;
  }

  return (
    <AnchoredPopin
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      labelId={titleId}
      className="production-fx-line-popin"
    >
      {body}
    </AnchoredPopin>
  );
}
