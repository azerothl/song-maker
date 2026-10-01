import type { TrackEffectSlot } from "@song-maker/mix-production";
import { t } from "../../ui/i18n";

const PARAM_EQ_TYPES = [
  "peak",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
  "notch",
] as const;

const CURVE_LABEL: Record<
  (typeof PARAM_EQ_TYPES)[number],
  | "phase3.mix.param.curve.peak"
  | "phase3.mix.param.curve.lowshelf"
  | "phase3.mix.param.curve.highshelf"
  | "phase3.mix.param.curve.lowpass"
  | "phase3.mix.param.curve.highpass"
  | "phase3.mix.param.curve.notch"
> = {
  peak: "phase3.mix.param.curve.peak",
  lowshelf: "phase3.mix.param.curve.lowshelf",
  highshelf: "phase3.mix.param.curve.highshelf",
  lowpass: "phase3.mix.param.curve.lowpass",
  highpass: "phase3.mix.param.curve.highpass",
  notch: "phase3.mix.param.curve.notch",
};

type Props = {
  fx: TrackEffectSlot;
  updateEffectParam: (
    key: string,
    value: number | string | boolean,
  ) => void;
};

export function ParametricEqBandFields({ fx, updateEffectParam }: Props) {
  if (fx.kind !== "parametricEq") return null;

  return (
    <>
      <p className="hint">{t("phase3.mix.param.eqBandsHint")}</p>
      {[0, 1, 2, 3].map((bi) => (
        <div key={bi} className="phase3-fields">
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={fx.params[`band${bi}Enabled`] !== false}
              onChange={(e) =>
                updateEffectParam(`band${bi}Enabled`, e.target.checked)
              }
            />
            <span>
              {t("phase3.mix.param.band")} {bi + 1}
            </span>
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.curveType")}</span>
            <select
              value={String(fx.params[`band${bi}Type`] ?? "peak")}
              onChange={(e) =>
                updateEffectParam(`band${bi}Type`, e.target.value)
              }
            >
              {PARAM_EQ_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(CURVE_LABEL[tp])}
                </option>
              ))}
            </select>
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.frequencyHz")}</span>
            <input
              type="number"
              step={1}
              min={20}
              max={20000}
              value={Number(fx.params[`band${bi}Freq`] ?? 1000)}
              onChange={(e) =>
                updateEffectParam(`band${bi}Freq`, Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.gainDb")}</span>
            <input
              type="number"
              step={0.5}
              min={-24}
              max={24}
              value={Number(fx.params[`band${bi}Gain`] ?? 0)}
              onChange={(e) =>
                updateEffectParam(`band${bi}Gain`, Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.q")}</span>
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={18}
              value={Number(fx.params[`band${bi}Q`] ?? 0.7)}
              onChange={(e) =>
                updateEffectParam(`band${bi}Q`, Number(e.target.value))
              }
            />
          </label>
        </div>
      ))}
    </>
  );
}
