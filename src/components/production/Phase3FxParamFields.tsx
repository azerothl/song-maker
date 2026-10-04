import {
  extractSpectralEnvelope,
  parseEnvelope,
  serializeEnvelope,
  type TrackEffectSlot,
} from "@song-maker/mix-production";
import {
  formatProductionDb,
  formatProductionDbPerOct,
} from "../../lib/productionFormat";
import { t } from "../../ui/i18n";
import {
  formatProductionDb,
  formatProductionDbPerOct,
} from "../../lib/productionFormat";
import { t } from "../../ui/i18n";

const DELAY_DIV_OPTIONS = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/2d",
  "1/4d",
  "1/8d",
  "1/4t",
  "1/8t",
] as const;

export type Phase3FxParamFieldsProps = {
  fx: TrackEffectSlot;
  updateEffectParam: (
    key: string,
    value: number | string | boolean,
  ) => void;
  grByEffect?: Record<string, number>;
  tempoBpm?: number | null;
};

export function Phase3FxParamFields({
  fx,
  updateEffectParam,
  grByEffect,
  tempoBpm = null,
}: Phase3FxParamFieldsProps) {
  switch (fx.kind) {
    case "limiter":
      return (
        <label className="phase3-field">
          <span>{t("phase3.mix.param.ceilingDb")}</span>
          <input
            type="number"
            step={0.1}
            value={Number(fx.params.ceilingDb ?? -1)}
            onChange={(e) =>
              updateEffectParam("ceilingDb", Number(e.target.value))
            }
          />
        </label>
      );
    case "compressor":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.thresholdDb")}</span>
            <input
              type="number"
              step={0.5}
              value={Number(fx.params.thresholdDb ?? -18)}
              onChange={(e) =>
                updateEffectParam("thresholdDb", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.ratio")}</span>
            <input
              type="number"
              step={0.1}
              min={1}
              max={20}
              value={Number(fx.params.ratio ?? 3)}
              onChange={(e) =>
                updateEffectParam("ratio", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.attackMs")}</span>
            <input
              type="number"
              step={1}
              min={0}
              max={500}
              value={Number(fx.params.attackMs ?? 10)}
              onChange={(e) =>
                updateEffectParam("attackMs", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.releaseMs")}</span>
            <input
              type="number"
              step={1}
              min={1}
              max={2000}
              value={Number(fx.params.releaseMs ?? 100)}
              onChange={(e) =>
                updateEffectParam("releaseMs", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.kneeDb")}</span>
            <input
              type="number"
              step={0.5}
              min={0}
              max={24}
              value={Number(fx.params.kneeDb ?? 0)}
              onChange={(e) =>
                updateEffectParam("kneeDb", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.makeupDb")}</span>
            <input
              type="number"
              step={0.5}
              value={Number(fx.params.makeupDb ?? 0)}
              onChange={(e) =>
                updateEffectParam("makeupDb", Number(e.target.value))
              }
            />
          </label>
          {grByEffect?.[fx.id] != null && (
            <p className="hint">
              {t("production.mix.param.gainReductionNamed", {
                value: formatProductionDb(-grByEffect[fx.id]!),
              })}
            </p>
          )}
        </>
      );
    case "gate":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.thresholdDb")}</span>
            <input
              type="number"
              step={0.5}
              value={Number(fx.params.thresholdDb ?? -40)}
              onChange={(e) =>
                updateEffectParam("thresholdDb", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.ratio")}</span>
            <input
              type="number"
              step={0.5}
              min={1}
              max={100}
              value={Number(fx.params.ratio ?? 10)}
              onChange={(e) =>
                updateEffectParam("ratio", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.attackMs")}</span>
            <input
              type="number"
              step={0.5}
              min={0.1}
              max={200}
              value={Number(fx.params.attackMs ?? 5)}
              onChange={(e) =>
                updateEffectParam("attackMs", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.releaseMs")}</span>
            <input
              type="number"
              step={1}
              min={1}
              max={2000}
              value={Number(fx.params.releaseMs ?? 80)}
              onChange={(e) =>
                updateEffectParam("releaseMs", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.rangeDb")}</span>
            <input
              type="number"
              step={1}
              min={0}
              max={90}
              value={Number(fx.params.rangeDb ?? 60)}
              onChange={(e) =>
                updateEffectParam("rangeDb", Number(e.target.value))
              }
            />
          </label>
        </>
      );
    case "eq":
      return (
        <label className="phase3-field">
          <span>{t("phase3.mix.param.gainDb")}</span>
          <input
            type="number"
            step={0.5}
            value={Number(fx.params.gainDb ?? 0)}
            onChange={(e) =>
              updateEffectParam("gainDb", Number(e.target.value))
            }
          />
        </label>
      );
    case "parametricEq":
      return null;
    case "filter":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.filterMode")}</span>
            <select
              value={String(fx.params.mode ?? "highpass")}
              onChange={(e) => updateEffectParam("mode", e.target.value)}
            >
              <option value="highpass">
                {t("phase3.mix.param.filterHighpass")}
              </option>
              <option value="lowpass">
                {t("phase3.mix.param.filterLowpass")}
              </option>
            </select>
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.frequencyHz")}</span>
            <input
              type="number"
              step={1}
              min={20}
              max={20000}
              value={Number(fx.params.frequencyHz ?? 80)}
              onChange={(e) =>
                updateEffectParam("frequencyHz", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.slopeDbPerOct")}</span>
            <select
              value={String(fx.params.slopeDbPerOct ?? 12)}
              onChange={(e) =>
                updateEffectParam("slopeDbPerOct", Number(e.target.value))
              }
            >
              <option value={12}>{formatProductionDbPerOct(12)}</option>
              <option value={24}>{formatProductionDbPerOct(24)}</option>
            </select>
          </label>
        </>
      );
    case "delay":
      return (
        <>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={fx.params.sync === true || fx.params.sync === 1}
              onChange={(e) => updateEffectParam("sync", e.target.checked)}
            />
            <span>{t("phase3.mix.param.delaySync")}</span>
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.delayMs")}</span>
            <input
              type="number"
              step={1}
              min={1}
              max={2000}
              value={Number(fx.params.delayMs ?? 350)}
              onChange={(e) =>
                updateEffectParam("delayMs", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.division")}</span>
            <select
              value={String(fx.params.division ?? "1/4")}
              onChange={(e) => updateEffectParam("division", e.target.value)}
            >
              {DELAY_DIV_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.tempoBpm")}</span>
            <input
              type="number"
              step={1}
              min={0}
              max={300}
              value={Number(fx.params.tempoBpm ?? tempoBpm ?? 0)}
              onChange={(e) =>
                updateEffectParam("tempoBpm", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.feedback")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={0.95}
              value={Number(fx.params.feedback ?? 0.35)}
              onChange={(e) =>
                updateEffectParam("feedback", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.mix")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.mix ?? 0.35)}
              onChange={(e) => updateEffectParam("mix", Number(e.target.value))}
            />
          </label>
          <p className="hint">{t("phase3.mix.param.delayHint")}</p>
        </>
      );
    case "reverb":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.mix")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.mix ?? 0.35)}
              onChange={(e) => updateEffectParam("mix", Number(e.target.value))}
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.roomSize")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.roomSize ?? 0.55)}
              onChange={(e) =>
                updateEffectParam("roomSize", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.damping")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.damping ?? 0.45)}
              onChange={(e) =>
                updateEffectParam("damping", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.width")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.width ?? 1)}
              onChange={(e) =>
                updateEffectParam("width", Number(e.target.value))
              }
            />
          </label>
        </>
      );
    case "pitch_correct":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.pitchMode")}</span>
            <select
              value={String(fx.params.mode ?? "chromatic")}
              onChange={(e) => updateEffectParam("mode", e.target.value)}
            >
              <option value="chromatic">
                {t("phase3.mix.pitchCorrect.mode.chromatic")}
              </option>
              <option value="scale">
                {t("phase3.mix.pitchCorrect.mode.scale")}
              </option>
            </select>
          </label>
          {String(fx.params.mode) === "scale" && (
            <>
              <label className="phase3-field">
                <span>{t("phase3.mix.param.tonic")}</span>
                <select
                  value={Number(fx.params.tonic ?? 0)}
                  onChange={(e) =>
                    updateEffectParam("tonic", Number(e.target.value))
                  }
                >
                  {(
                    [
                      "C",
                      "C#",
                      "D",
                      "Eb",
                      "E",
                      "F",
                      "F#",
                      "G",
                      "Ab",
                      "A",
                      "Bb",
                      "B",
                    ] as const
                  ).map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="phase3-field">
                <span>{t("phase3.mix.param.scale")}</span>
                <select
                  value={String(fx.params.scale ?? "major")}
                  onChange={(e) => updateEffectParam("scale", e.target.value)}
                >
                  <option value="major">
                    {t("phase3.mix.pitchCorrect.scale.major")}
                  </option>
                  <option value="minor">
                    {t("phase3.mix.pitchCorrect.scale.minor")}
                  </option>
                </select>
              </label>
            </>
          )}
          <label className="phase3-field">
            <span>{t("phase3.mix.param.intensity")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.intensity ?? 0.7)}
              onChange={(e) =>
                updateEffectParam("intensity", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.speed")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.speed ?? 0.55)}
              onChange={(e) =>
                updateEffectParam("speed", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={Boolean(fx.params.formantPreserve ?? true)}
              onChange={(e) =>
                updateEffectParam("formantPreserve", e.target.checked)
              }
            />
            <span>{t("phase3.mix.param.formantPreserve")}</span>
          </label>
          <p className="hint">{t("phase3.mix.pitchCorrect.honesty")}</p>
        </>
      );
    case "voice_cleanup":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.strength")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.strength ?? 0.55)}
              onChange={(e) =>
                updateEffectParam("strength", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.noiseFloorDb")}</span>
            <input
              type="number"
              step={1}
              min={-90}
              max={-6}
              value={Number(fx.params.noiseFloorDb ?? -48)}
              onChange={(e) =>
                updateEffectParam("noiseFloorDb", Number(e.target.value))
              }
            />
          </label>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.preserveAttack")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.preserveAttack ?? 0.65)}
              onChange={(e) =>
                updateEffectParam("preserveAttack", Number(e.target.value))
              }
            />
          </label>
          <p className="hint">{t("phase3.mix.voiceCleanup.honesty")}</p>
        </>
      );
    case "voice_convert": {
      const consented = fx.params.consentOwnVoice === true;
      const hasRef = parseEnvelope(fx.params.targetEnvelope) != null;
      const refName =
        typeof fx.params.referenceName === "string" && fx.params.referenceName
          ? fx.params.referenceName
          : null;
      return (
        <>
          <label className="phase3-check">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) =>
                updateEffectParam("consentOwnVoice", e.target.checked)
              }
            />
            <span>{t("phase3.mix.voiceConvert.consent")}</span>
          </label>
          <p className="hint">{t("phase3.mix.voiceConvert.loicConstraint")}</p>
          <p className="hint">{t("phase3.mix.voiceConvert.legal")}</p>
          <label className="phase3-field">
            <span>{t("phase3.mix.voiceConvert.reference")}</span>
            <input
              type="file"
              accept="audio/wav,audio/x-wav,.wav"
              disabled={!consented}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void (async () => {
                  const Ctx =
                    globalThis.AudioContext ??
                    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
                      .webkitAudioContext;
                  if (!Ctx) return;
                  const ctx = new Ctx();
                  try {
                    const buf = await file.arrayBuffer();
                    const audio = await ctx.decodeAudioData(buf.slice(0));
                    const ch = audio.getChannelData(0);
                    const env = extractSpectralEnvelope(ch, audio.sampleRate);
                    updateEffectParam(
                      "targetEnvelope",
                      serializeEnvelope(env),
                    );
                    updateEffectParam("referenceName", file.name);
                  } finally {
                    await ctx.close().catch(() => undefined);
                  }
                })();
              }}
            />
          </label>
          {refName && (
            <p className="hint">
              {t("phase3.mix.voiceConvert.referenceLoaded", { name: refName })}
            </p>
          )}
          <label className="phase3-field">
            <span>{t("phase3.mix.param.mix")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.mix ?? 0.65)}
              onChange={(e) => updateEffectParam("mix", Number(e.target.value))}
            />
          </label>
          <p className="hint">
            {!consented
              ? t("phase3.mix.voiceConvert.needsConsent")
              : !hasRef
                ? t("phase3.mix.voiceConvert.needsReference")
                : t("phase3.mix.voiceConvert.ready")}
          </p>
          <details>
            <summary>{t("phase3.mix.voiceConvert.leftovers.title")}</summary>
            <ul>
              <li>{t("phase3.mix.voiceConvert.leftovers.model")}</li>
              <li>{t("phase3.mix.voiceConvert.leftovers.neuralDenoise")}</li>
              <li>{t("phase3.mix.voiceConvert.leftovers.weights")}</li>
            </ul>
          </details>
        </>
      );
    }
    case "voice_denoise":
      return (
        <>
          <label className="phase3-field">
            <span>{t("phase3.mix.param.strength")}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(fx.params.strength ?? 0.55)}
              onChange={(e) =>
                updateEffectParam("strength", Number(e.target.value))
              }
            />
          </label>
          <p className="hint">{t("phase3.mix.voiceDenoise.honesty")}</p>
        </>
      );
    case "custom":
      return null;
    default: {
      const _exhaustive: never = fx.kind;
      void _exhaustive;
      return null;
    }
  }
}
