import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { LoudnessReport } from "@song-maker/mix-production";
import { AnchoredPopin } from "./AnchoredPopin";
import { MixSlider } from "./MixSlider";
import { PopinCloseButton } from "./PopinCloseButton";
import {
  ProductionClipViewControls,
  productionClipViewControlNames,
} from "./ProductionClipViewControls";
import type { ProductionClipViewPrefs } from "../lib/productionClipViewPrefs";
import type { ProductionDensityPreference } from "../lib/productionTrackLayout";
import { bakeMixPcm, decodeMixStems } from "../lib/mixBridge";
import { getProductionToolkit } from "../lib/productionState";
import type { MixDoc, PlaybackSources } from "../lib/types";
import {
  formatGainDb,
  parseGainDb,
} from "../screens/song/shared";
import { t } from "../ui/i18n";

export type ProductionMixSettingsPopinProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  clipView: ProductionClipViewPrefs;
  onClipViewChange: (patch: Partial<ProductionClipViewPrefs>) => void;
  densityPreference: ProductionDensityPreference;
  effectiveDensityLabelKey: "mix.density.compact" | "mix.density.confortable";
  onDensityPreference: (next: ProductionDensityPreference) => void;
  mix: MixDoc;
  onMasterGainChange: (gainDb: number, persist: boolean) => void;
  sources: PlaybackSources | null;
  tempoBpm?: number | null;
  hasAiStems: boolean;
  separateDisabled: boolean;
  separateDisabledReason?: string;
  onSeparateClick: (anchor: HTMLButtonElement) => void;
  showMixAssist: boolean;
  showProductionCopilot: boolean;
  onOpenMixAssist: (anchor: HTMLButtonElement) => void;
  onOpenCopilot: (anchor: HTMLButtonElement) => void;
  panelId: string;
  labelId: string;
  deferEscapeClose?: boolean;
  preferAboveAnchor?: boolean;
};

export function productionMixSettingsFieldAccessibleNames(
  prefs: ProductionClipViewPrefs,
  opts: {
    densityPreference: ProductionDensityPreference;
    showMixAssist: boolean;
    showProductionCopilot: boolean;
    hasAiStems: boolean;
    separateDisabled: boolean;
  },
): string[] {
  const names: string[] = [
    t("production.mixSettings.close"),
    ...productionClipViewControlNames(prefs, "full"),
    t("mix.density.auto"),
    t("mix.density.compact"),
    t("mix.density.confortable"),
    t("production.settings.master"),
    t("phase3.mix.runLimiterMeter"),
    opts.hasAiStems ? t("separate.again") : t("separate.button"),
  ];
  if (opts.showMixAssist || opts.showProductionCopilot) {
    names.push(t("mix.assist.drawer"));
  }
  return names;
}

export function ProductionMixSettingsPopin({
  open,
  onClose,
  anchorRef,
  clipView,
  onClipViewChange,
  densityPreference,
  effectiveDensityLabelKey,
  onDensityPreference,
  mix,
  onMasterGainChange,
  sources,
  tempoBpm = null,
  hasAiStems,
  separateDisabled,
  separateDisabledReason,
  onSeparateClick,
  showMixAssist,
  showProductionCopilot,
  onOpenMixAssist,
  onOpenCopilot,
  panelId,
  labelId,
  deferEscapeClose = false,
  preferAboveAnchor = false,
}: ProductionMixSettingsPopinProps) {
  const separateRef = useRef<HTMLButtonElement>(null);
  const mixToolsRef = useRef<HTMLButtonElement>(null);
  const separateReasonId = useId();
  const toolsMenuId = useId();
  const [mixToolsMenuOpen, setMixToolsMenuOpen] = useState(false);
  const [loudness, setLoudness] = useState<LoudnessReport | null>(null);
  const [loudnessDurationSec, setLoudnessDurationSec] = useState<number | null>(
    null,
  );
  const [measuring, setMeasuring] = useState(false);
  const [measureError, setMeasureError] = useState<string | null>(null);
  const measureGen = useRef(0);

  const showMixToolsEntry = showMixAssist || showProductionCopilot;
  const dualMixTools = showMixAssist && showProductionCopilot;

  const closeAndReset = () => {
    setMixToolsMenuOpen(false);
    onClose();
  };

  const separateReason = separateDisabled ? separateDisabledReason : undefined;

  const measureLoudness = async () => {
    const gen = ++measureGen.current;
    setMeasuring(true);
    setMeasureError(null);
    try {
      if (!sources || sources.mode !== "stems" || sources.stems.length === 0) {
        throw new Error(t("phase3.mix.loudnessNeedStems"));
      }
      const { stems, sampleRate } = await decodeMixStems(sources, mix);
      if (gen !== measureGen.current) return;
      const baked = bakeMixPcm(mix, stems, getProductionToolkit(), {
        tempoBpm,
      });
      const sr = sampleRate || mix.sampleRate || 48000;
      const report = getProductionToolkit().loudness.measurePcm(
        baked.pcm,
        sr,
        "ebu_r128",
      );
      if (gen !== measureGen.current) return;
      setLoudness(report);
      setLoudnessDurationSec(baked.frameCount / sr);
    } catch (e) {
      if (gen !== measureGen.current) return;
      setLoudness(null);
      setLoudnessDurationSec(null);
      setMeasureError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === measureGen.current) setMeasuring(false);
    }
  };

  const onToolsMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setMixToolsMenuOpen(false);
      mixToolsRef.current?.focus();
    }
  };

  return (
    <AnchoredPopin
      open={open}
      onClose={closeAndReset}
      anchorRef={anchorRef}
      labelId={labelId}
      panelId={panelId}
      deferEscapeClose={deferEscapeClose}
      preferAboveAnchor={preferAboveAnchor}
      className="production-mix-settings-popin"
    >
      <header className="anchored-popin-header production-mix-settings-header">
        <h3 id={labelId}>{t("production.mixSettings.title")}</h3>
        <PopinCloseButton
          label={t("production.mixSettings.close")}
          onClick={closeAndReset}
        />
      </header>
      <div
        className="production-mix-settings-body"
        data-testid="production-mix-settings-popin"
      >
        <fieldset className="production-mix-settings-field">
          <legend>{t("production.mixSettings.grid")}</legend>
          <p className="hint">{t("production.mixSettings.gridHint")}</p>
          <ProductionClipViewControls
            prefs={clipView}
            onChange={onClipViewChange}
            variant="full"
            idPrefix="mix-settings-grid"
          />
        </fieldset>

        <fieldset className="production-mix-settings-field">
          <legend>{t("production.mixSettings.densityLegend")}</legend>
          <div
            className="production-density-seg production-mix-settings-density"
            role="group"
            aria-label={t("mix.density.group")}
          >
            {(["auto", "compact", "confortable"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="production-density-btn production-mix-settings-density-btn"
                aria-pressed={densityPreference === mode}
                onClick={() => onDensityPreference(mode)}
              >
                <span className="production-density-check" aria-hidden>
                  ✓
                </span>
                {t(`mix.density.${mode}`)}
              </button>
            ))}
          </div>
          {densityPreference === "auto" && (
            <p className="production-density-auto-hint" role="status">
              {t("mix.density.autoStatus", { mode: t(effectiveDensityLabelKey) })}
            </p>
          )}
        </fieldset>

        <fieldset className="production-mix-settings-field">
          <legend>{t("production.mixSettings.sound")}</legend>
          <MixSlider
            className="production-mix-settings-master-fader"
            value={mix.masterGainDb}
            min={-24}
            max={12}
            step={0.5}
            defaultValue={0}
            ariaLabel={t("production.settings.master")}
            valueText={`${formatGainDb(mix.masterGainDb)}`}
            displayValue={formatGainDb(mix.masterGainDb)}
            parseDisplay={parseGainDb}
            onChange={(gainDb) => onMasterGainChange(gainDb, false)}
            onCommit={(gainDb) => onMasterGainChange(gainDb, true)}
          />
          <button
            type="button"
            className="btn primary production-mix-settings-loudness"
            data-testid="production-mix-settings-loudness"
            disabled={measuring}
            onClick={() => void measureLoudness()}
          >
            {measuring
              ? t("phase3.mix.loudnessMeasuring")
              : t("phase3.mix.runLimiterMeter")}
          </button>
          {measureError && (
            <p className="hint error" role="alert">
              {measureError}
            </p>
          )}
          {loudness && (
            <p
              className="production-mix-settings-loudness-result"
              role="status"
              data-testid="production-mix-settings-loudness-result"
            >
              {t("phase3.mix.loudness")}:{" "}
              {loudness.integratedLufs?.toFixed(1) ?? "—"} LUFS ·{" "}
              {t("phase3.mix.truePeak")}:{" "}
              {loudness.truePeakDbfs?.toFixed(1) ?? "—"} dBFS
              {loudnessDurationSec != null && (
                <>
                  {" "}
                  · {t("phase3.mix.loudnessDuration")}:{" "}
                  {loudnessDurationSec.toFixed(2)} s
                </>
              )}
            </p>
          )}
          <p className="hint">{t("phase3.mix.loudnessNote")}</p>
        </fieldset>

        <fieldset className="production-mix-settings-field">
          <legend>{t("production.mixSettings.tracks")}</legend>
          <button
            ref={separateRef}
            type="button"
            className="btn production-mix-settings-separate"
            data-testid="production-mix-settings-separate"
            disabled={separateDisabled}
            aria-disabled={separateDisabled || undefined}
            aria-describedby={separateReason ? separateReasonId : undefined}
            onClick={() => {
              if (separateRef.current) onSeparateClick(separateRef.current);
            }}
          >
            {hasAiStems ? t("separate.again") : t("separate.button")}
          </button>
          {separateReason && (
            <p id={separateReasonId} className="hint production-mix-settings-separate-reason">
              {separateReason}
            </p>
          )}

          {showMixToolsEntry && (
            <div className="production-mix-settings-tools-entry">
              <button
                ref={mixToolsRef}
                type="button"
                className="btn"
                aria-haspopup={dualMixTools ? "menu" : "dialog"}
                aria-expanded={dualMixTools ? mixToolsMenuOpen : undefined}
                aria-controls={dualMixTools ? toolsMenuId : undefined}
                onClick={() => {
                  if (dualMixTools) {
                    setMixToolsMenuOpen((v) => !v);
                    return;
                  }
                  if (mixToolsRef.current) {
                    if (showMixAssist) onOpenMixAssist(mixToolsRef.current);
                    else if (showProductionCopilot) onOpenCopilot(mixToolsRef.current);
                  }
                }}
              >
                {t("mix.assist.drawer")}
              </button>
              {dualMixTools && mixToolsMenuOpen && (
                <ul
                  id={toolsMenuId}
                  className="production-mix-settings-tools-menu"
                  role="menu"
                  aria-label={t("production.mixSettings.toolsMenu")}
                  onKeyDown={onToolsMenuKeyDown}
                >
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      onClick={() => {
                        setMixToolsMenuOpen(false);
                        if (mixToolsRef.current) onOpenMixAssist(mixToolsRef.current);
                      }}
                    >
                      {t("mix.assist.drawer")}
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      onClick={() => {
                        setMixToolsMenuOpen(false);
                        if (mixToolsRef.current) onOpenCopilot(mixToolsRef.current);
                      }}
                    >
                      {t("copilot.title")}
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
        </fieldset>
      </div>
    </AnchoredPopin>
  );
}

export { productionClipViewControlNames };
