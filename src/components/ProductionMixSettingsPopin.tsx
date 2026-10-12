import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { LoudnessReport } from "@song-maker/mix-production";
import { AnchoredPopin } from "./AnchoredPopin";
import { api } from "../lib/api";
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
import type {
  MixDoc,
  PlaybackSources,
  Vst3CatalogEntry,
  Vst3PluginDescription,
} from "../lib/types";
import {
  formatGainDb,
  parseGainDb,
} from "../screens/song/shared";
import { t } from "../ui/i18n";
import { ErrorNotice } from "./ErrorNotice";

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
  onMixChange: (next: MixDoc, opts?: { persist?: boolean }) => void;
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
      t("production.vst3.legend"),
      t("production.vst3.scan"),
      t("production.vst3.enabled"),
      t("production.vst3.remove"),
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
  onMixChange,
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
  const [vst3Plugins, setVst3Plugins] = useState<Vst3CatalogEntry[] | null>(null);
  const [vst3PluginKinds, setVst3PluginKinds] = useState<
    Record<string, "effect" | "instrument" | "incompatible">
  >({});
  const [vst3Scanning, setVst3Scanning] = useState(false);
  const [vst3Error, setVst3Error] = useState<string | null>(null);
  const [vst3Description, setVst3Description] =
    useState<Vst3PluginDescription | null>(null);
  const [vst3ParameterDrafts, setVst3ParameterDrafts] = useState<
    Record<string, number>
  >({});
  const [vst3Loading, setVst3Loading] = useState(false);
  const [vst3EditorOpening, setVst3EditorOpening] = useState(false);
  const vst3InspectedPath = useRef<string | null>(null);
  const vst3FormatRequest = useRef(0);
  const vst3Insert = mix.vst3MasterInsert ?? null;
  const vst3Supported =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const hasVst3Sources =
    sources?.mode === "stems" && sources.stems.length > 0;
  const vst3PluginAvailable =
    !vst3Insert ||
    vst3Plugins === null ||
    vst3Plugins.some((plugin) => plugin.path === vst3Insert.pluginPath);

  useEffect(() => {
    if (!open || !vst3Supported || vst3Plugins !== null) return;
    let current = true;
    setVst3Scanning(true);
    setVst3Error(null);
    void api
      .vst3ListPlugins()
      .then((items) => {
        if (current) setVst3Plugins(items);
      })
      .catch((e) => {
        if (current) setVst3Error(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (current) setVst3Scanning(false);
      });
    return () => {
      current = false;
    };
  }, [open, vst3Plugins, vst3Supported]);

  useEffect(() => {
    const path = vst3Insert?.pluginPath;
    if (!open || !vst3Supported || !path) {
      if (!path) {
        vst3InspectedPath.current = null;
        setVst3Description(null);
      }
      return;
    }
    if (vst3InspectedPath.current === path) return;
    let current = true;
    vst3InspectedPath.current = path;
    setVst3Loading(true);
    setVst3Error(null);
    void api
      .vst3PluginParameters(
        path,
        vst3Insert.parameters,
        vst3Insert.stateB64,
      )
      .then((description) => {
        if (current) {
          setVst3Description(description);
          const kind = description.category.toLowerCase().includes("instrument") &&
            description.audioInputs === 0 && description.audioOutputs > 0
            ? "instrument"
            : description.audioInputs > 0 && description.audioOutputs > 0 &&
                !description.category.toLowerCase().includes("instrument")
              ? "effect"
              : "incompatible";
          setVst3PluginKinds((items) => ({
            ...items,
            [path]: kind,
          }));
        }
      })
      .catch((e) => {
        if (current) {
          setVst3PluginKinds((items) => ({ ...items, [path]: "incompatible" }));
          vst3InspectedPath.current = null;
          setVst3Description(null);
          setVst3Error(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (current) setVst3Loading(false);
      });
    return () => {
      current = false;
    };
  }, [open, vst3Insert?.pluginPath, vst3Supported]);

  const scanVst3Plugins = async () => {
    setVst3Scanning(true);
    setVst3Error(null);
    try {
      setVst3Plugins(await api.vst3ListPlugins());
    } catch (e) {
      setVst3Error(e instanceof Error ? e.message : String(e));
    } finally {
      setVst3Scanning(false);
    }
  };

  const selectVst3Plugin = async (path: string) => {
    const plugin = vst3Plugins?.find((item) => item.path === path);
    if (!plugin) return;
    const samePlugin = vst3Insert?.pluginPath === plugin.path;
    const savedParameters = samePlugin ? vst3Insert.parameters : {};
    const savedState = samePlugin ? vst3Insert.stateB64 : undefined;
    setVst3Loading(true);
    setVst3Error(null);
    vst3FormatRequest.current++;
    try {
      const description = await api.vst3PluginParameters(
        plugin.path,
        savedParameters,
        savedState,
      );
      const kind = description.category.toLowerCase().includes("instrument") &&
        description.audioInputs === 0 && description.audioOutputs > 0
        ? "instrument"
        : description.audioInputs > 0 && description.audioOutputs > 0 &&
            !description.category.toLowerCase().includes("instrument")
          ? "effect"
          : "incompatible";
      setVst3PluginKinds((items) => ({ ...items, [plugin.path]: kind }));
      if (
        kind !== "effect"
      ) {
        throw new Error(t("production.vst3.notEffect"));
      }
      const nextInsert = {
        pluginPath: plugin.path,
        pluginName: plugin.name,
        enabled: samePlugin ? vst3Insert.enabled : false,
        parameters: savedParameters,
        stateB64: savedState,
      };
      setVst3ParameterDrafts({});
      vst3InspectedPath.current = plugin.path;
      setVst3Description(description);
      onMixChange({ ...mix, vst3MasterInsert: nextInsert });
    } catch (e) {
      setVst3Error(e instanceof Error ? e.message : String(e));
    } finally {
      setVst3Loading(false);
    }
  };

  const patchVst3Insert = (
    patch: Partial<NonNullable<MixDoc["vst3MasterInsert"]>>,
    persist = true,
  ) => {
    if (!vst3Insert) return;
    onMixChange(
      { ...mix, vst3MasterInsert: { ...vst3Insert, ...patch } },
      { persist },
    );
  };

  const draftVst3Parameter = (id: number, value: number) => {
    setVst3ParameterDrafts((current) => ({
      ...current,
      [String(id)]: value,
    }));
  };

  const commitVst3Parameter = (id: number, value: number) => {
    if (!vst3Insert) return;
    const key = String(id);
    const parameters = { ...vst3Insert.parameters, [key]: value };
    setVst3ParameterDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    patchVst3Insert({ parameters });
    const request = ++vst3FormatRequest.current;
    void api
      .vst3PluginParameters(
        vst3Insert.pluginPath,
        parameters,
        vst3Insert.stateB64,
      )
      .then((description) => {
        if (request === vst3FormatRequest.current) {
          setVst3Description(description);
        }
      })
      .catch((e) =>
        setVst3Error(e instanceof Error ? e.message : String(e)),
      );
  };

  const openVst3Editor = async () => {
    if (!vst3Insert || vst3EditorOpening) return;
    setVst3EditorOpening(true);
    setVst3Error(null);
    try {
      const result = await api.vst3OpenPluginEditor(
        vst3Insert.pluginPath,
        vst3Insert.parameters,
        vst3Insert.stateB64,
      );
      const parameters = Object.fromEntries(
        Object.entries(result.parameters).map(([id, value]) => [String(id), value]),
      );
      patchVst3Insert({
        parameters,
        stateB64: result.pluginStateB64 ?? undefined,
      });
      const description = await api.vst3PluginParameters(
        vst3Insert.pluginPath,
        parameters,
        result.pluginStateB64 ?? undefined,
      );
      setVst3Description(description);
      setVst3ParameterDrafts({});
    } catch (e) {
      setVst3Error(e instanceof Error ? e.message : String(e));
    } finally {
      setVst3EditorOpening(false);
    }
  };

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

        <fieldset className="production-mix-settings-field production-vst3-field">
          <legend>{t("production.vst3.legend")}</legend>
          <p className="hint">{t("production.vst3.hint")}</p>
          {!vst3Supported ? (
            <p className="hint">{t("production.vst3.notWindows")}</p>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={vst3Scanning}
                onClick={() => void scanVst3Plugins()}
              >
                {vst3Scanning
                  ? t("production.vst3.scanning")
                  : t("production.vst3.scan")}
              </button>
              {vst3Plugins?.length === 0 && (
                <p className="hint">{t("production.vst3.noPlugins")}</p>
              )}
              {vst3Plugins && vst3Plugins.length > 0 && (
                <label className="production-vst3-select-label">
                  {t("production.vst3.choose")}
                  <select
                    value={vst3Insert?.pluginPath ?? ""}
                    disabled={vst3Scanning || vst3Loading || vst3EditorOpening}
                    onChange={(event) =>
                      void selectVst3Plugin(event.currentTarget.value)
                    }
                  >
                    <option value="" disabled>
                      {t("production.vst3.choose")}
                    </option>
                    {vst3Insert &&
                      !vst3Plugins.some(
                        (plugin) => plugin.path === vst3Insert.pluginPath,
                      ) && (
                        <option value={vst3Insert.pluginPath}>
                          {vst3Insert.pluginName} — {t("production.vst3.missing")}
                        </option>
                      )}
                    {vst3Plugins.map((plugin) => (
                      <option key={plugin.path} value={plugin.path}>
                        {plugin.name}
                        {vst3PluginKinds[plugin.path]
                          ? ` · ${t(`production.vst3.kind.${vst3PluginKinds[plugin.path]}`)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {vst3Insert && (
                <>
                  {vst3Description && (
                    <p className="hint production-vst3-plugin-info">
                      {vst3Description.vendor}
                      {vst3Description.version
                        ? ` · ${vst3Description.version}`
                        : ""}
                    </p>
                  )}
                  {vst3Description?.name.toLowerCase().includes("anatomy") && (
                    <p className="hint" role="note">
                      {t("production.vst3.anatomyWorkflow")}
                    </p>
                  )}
                  <label className="production-vst3-enable">
                    <input
                      type="checkbox"
                      checked={vst3Insert.enabled}
                      disabled={
                        !hasVst3Sources || vst3Loading || vst3EditorOpening || !vst3PluginAvailable
                      }
                      onChange={(event) =>
                        patchVst3Insert({ enabled: event.currentTarget.checked })
                      }
                    />
                    {t("production.vst3.enabled")}
                  </label>
                  {!hasVst3Sources && (
                    <p className="hint">{t("production.vst3.needsStems")}</p>
                  )}
                  {!vst3PluginAvailable && (
                    <p className="hint error" role="alert">
                      {t("production.vst3.missing")}
                    </p>
                  )}
                  {vst3Loading && (
                    <p className="hint" role="status">
                      {t("production.vst3.loading")}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={vst3Loading || vst3EditorOpening || !vst3PluginAvailable}
                    onClick={() => void openVst3Editor()}
                  >
                    {vst3EditorOpening
                      ? t("production.vst3.editorWaiting")
                      : t("production.vst3.openEditor")}
                  </button>
                  {vst3Description && (
                    <div className="production-vst3-parameters">
                      <p className="hint">{t("production.vst3.parametersHint")}</p>
                      {vst3Description.parameters.filter(
                        (parameter) =>
                          parameter.canAutomate &&
                          !parameter.readOnly &&
                          !parameter.bypass,
                      ).length === 0 ? (
                        <p className="hint">{t("production.vst3.noParameters")}</p>
                      ) : (
                        vst3Description.parameters
                          .filter(
                            (parameter) =>
                              parameter.canAutomate &&
                              !parameter.readOnly &&
                              !parameter.bypass,
                          )
                          .map((parameter) => {
                            const value =
                              vst3ParameterDrafts[String(parameter.id)] ??
                              vst3Insert.parameters[String(parameter.id)] ??
                              parameter.value;
                            return (
                              <label
                                className="production-vst3-parameter"
                                key={parameter.id}
                              >
                                <span>
                                  {parameter.name}
                                  <output>
                                    {vst3ParameterDrafts[
                                      String(parameter.id)
                                    ] !== undefined
                                      ? `${Math.round(value * 100)}%`
                                      : parameter.formattedValue}
                                  </output>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={1000}
                                  step={1}
                                  value={Math.round(value * 1000)}
                                  aria-label={parameter.name}
                                  disabled={vst3Loading}
                                  onChange={(event) =>
                                    draftVst3Parameter(
                                      parameter.id,
                                      Number(event.currentTarget.value) / 1000,
                                    )
                                  }
                                  onPointerUp={(event) =>
                                    commitVst3Parameter(
                                      parameter.id,
                                      Number(event.currentTarget.value) / 1000,
                                    )
                                  }
                                  onKeyUp={(event) =>
                                    commitVst3Parameter(
                                      parameter.id,
                                      Number(event.currentTarget.value) / 1000,
                                    )
                                  }
                                />
                              </label>
                            );
                          })
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      vst3InspectedPath.current = null;
                      vst3FormatRequest.current++;
                      setVst3ParameterDrafts({});
                      setVst3Description(null);
                      onMixChange({
                        ...mix,
                        vst3MasterInsert: null,
                      });
                    }}
                  >
                    {t("production.vst3.remove")}
                  </button>
                </>
              )}
              {vst3Error && (
                <ErrorNotice message={vst3Error} />
              )}
            </>
          )}
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
            <ErrorNotice message={measureError} />
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
