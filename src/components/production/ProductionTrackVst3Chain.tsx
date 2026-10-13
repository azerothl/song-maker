import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type {
  MixDoc,
  Vst3CatalogEntry,
  Vst3PluginDescription,
  Vst3TrackEffect,
} from "../../lib/types";
import { t } from "../../ui/i18n";

type Props = {
  mix: MixDoc;
  trackId: string;
  active: boolean;
  onMixChange: (mix: MixDoc) => void;
};

function replaceTrackEffects(
  mix: MixDoc,
  trackId: string,
  effects: Vst3TrackEffect[],
): MixDoc {
  return {
    ...mix,
    tracks: mix.tracks.map((track) =>
      track.id === trackId ? { ...track, vst3Effects: effects } : track,
    ),
  };
}

function paramsRecord(description: Vst3PluginDescription): Record<string, number> {
  return Object.fromEntries(
    description.parameters.map((parameter) => [
      String(parameter.id),
      parameter.value,
    ]),
  );
}

export function ProductionTrackVst3Chain({
  mix,
  trackId,
  active,
  onMixChange,
}: Props) {
  const [catalog, setCatalog] = useState<Vst3CatalogEntry[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingPlugin, setLoadingPlugin] = useState(false);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionById, setDescriptionById] = useState<
    Record<string, Vst3PluginDescription>
  >({});
  const effects = useMemo(
    () => mix.tracks.find((track) => track.id === trackId)?.vst3Effects ?? [],
    [mix.tracks, trackId],
  );
  const trackName = mix.tracks.find((track) => track.id === trackId)?.name ?? trackId;
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const selectedPlugin = effects.find((effect) => effect.id === selectedEffectId) ?? effects[effects.length - 1];
  useEffect(() => {
    if (selectedPlugin && selectedPlugin.id !== selectedEffectId) {
      setSelectedEffectId(selectedPlugin.id);
    } else if (!selectedPlugin && selectedEffectId) {
      setSelectedEffectId(null);
    }
  }, [selectedEffectId, selectedPlugin]);
  const selectedDescription = selectedPlugin
    ? descriptionById[selectedPlugin.id]
    : undefined;

  const scan = async () => {
    if (loadingCatalog) return;
    setLoadingCatalog(true);
    setError(null);
    try {
      setCatalog(await api.vst3ListEffectPlugins());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (!active || catalog !== null) return;
    void scan();
    // The catalogue is intentionally scanned once while this tab is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, catalog]);

  useEffect(() => {
    if (!active || !selectedPlugin || descriptionById[selectedPlugin.id]) return;
    let current = true;
    void api
      .vst3PluginParameters(
        selectedPlugin.pluginPath,
        selectedPlugin.parameters,
        selectedPlugin.stateB64,
      )
      .then((description) => {
        if (current) {
          setDescriptionById((existing) => ({
            ...existing,
            [selectedPlugin.id]: description,
          }));
        }
      })
      .catch((reason) => {
        if (current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      current = false;
    };
  }, [active, descriptionById, selectedPlugin?.id, selectedPlugin?.pluginPath]);

  const commit = (next: Vst3TrackEffect[]) =>
    onMixChange(replaceTrackEffects(mix, trackId, next));

  const addEffect = async (plugin: Vst3CatalogEntry) => {
    if (loadingPlugin) return;
    setLoadingPlugin(true);
    setError(null);
    try {
      const description = await api.vst3PluginParameters(plugin.path);
      if (description.audioInputs < 1 || description.audioOutputs < 1) {
        throw new Error(t("production.vst3.notEffect"));
      }
      const effect: Vst3TrackEffect = {
        id: `vst3-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        pluginPath: plugin.path,
        pluginName: plugin.name,
        enabled: true,
        parameters: paramsRecord(description),
      };
      setDescriptionById((existing) => ({ ...existing, [effect.id]: description }));
      commit([...effects, effect]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingPlugin(false);
    }
  };

  const patchEffect = (
    id: string,
    patch: Partial<Vst3TrackEffect>,
    persist = true,
  ) => {
    const next = effects.map((effect) =>
      effect.id === id ? { ...effect, ...patch } : effect,
    );
    onMixChange(replaceTrackEffects(mix, trackId, next));
    if (!persist) return;
  };

  const patchParameter = (id: string, parameterId: number, value: number) => {
    const effect = effects.find((item) => item.id === id);
    if (!effect) return;
    const parameters = { ...effect.parameters, [String(parameterId)]: value };
    patchEffect(id, { parameters });
  };
  const openEditor = async (effect: Vst3TrackEffect) => {
    if (openingEditor) return;
    setOpeningEditor(true);
    setError(null);
    try {
      const result = await api.vst3OpenPluginEditor(
        effect.pluginPath,
        effect.parameters,
        effect.stateB64,
      );
      patchEffect(effect.id, {
        parameters: result.parameters,
        stateB64: result.pluginStateB64 ?? undefined,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOpeningEditor(false);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const destination = index + delta;
    if (destination < 0 || destination >= effects.length) return;
    const next = [...effects];
    [next[index], next[destination]] = [next[destination], next[index]];
    commit(next);
  };

  return (
    <section className="production-track-vst3" aria-label={t("production.track.vst3.title")}>
      <header className="production-track-vst3-header">
        <div>
          <h4>{t("production.track.vst3.title")}</h4>
          <p className="hint">{t("production.track.vst3.hint")}</p>
        </div>
        <button
          className="btn"
          type="button"
          disabled={loadingCatalog}
          onClick={() => void scan()}
        >
          {t(loadingCatalog ? "production.vst3.scanning" : "production.vst3.scan")}
        </button>
      </header>

      <div className="production-track-vst3-scope">
        <strong>{t("production.track.vst3.scope", { track: trackName })}</strong>
        <p>{t("production.track.vst3.offline")}</p>
        <p>{t("production.track.vst3.catalogHint")}</p>
      </div>

      {catalog === null ? (
        <p className="hint" role="status">{t("production.vst3.scanning")}</p>
      ) : catalog.length === 0 ? (
        <p className="hint">{t("production.vst3.noPlugins")}</p>
      ) : (
        <label className="production-track-vst3-add">
          {t("production.track.vst3.add")}
          <select
            value=""
            disabled={loadingPlugin}
            onChange={(event) => {
              const plugin = catalog.find((item) => item.path === event.target.value);
              if (plugin) void addEffect(plugin);
            }}
          >
            <option value="">{t("production.vst3.choose")}</option>
            {catalog.map((plugin) => (
              <option key={plugin.path} value={plugin.path}>{plugin.name}</option>
            ))}
          </select>
        </label>
      )}

      {effects.length > 0 && (
        <ol className="production-track-vst3-list">
          {effects.map((effect, index) => (
            <li key={effect.id} className="production-track-vst3-item">
              <div className="production-track-vst3-toggle">
                <label className="production-track-vst3-enabled">
                  <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={(event) => patchEffect(effect.id, { enabled: event.target.checked })}
                  />
                  <span>{t("production.track.vst3.active")}</span>
                </label>
                <button
                  className="production-track-vst3-select"
                  type="button"
                  aria-pressed={selectedEffectId === effect.id}
                  onClick={() => setSelectedEffectId(effect.id)}
                >
                  {effect.pluginName}
                </button>
              </div>
              <div className="btn-row">
                <button className="btn" type="button" disabled={index === 0} aria-label={t("production.fx.moveUpNamed", { effect: effect.pluginName })} onClick={() => move(index, -1)}>↑</button>
                <button className="btn" type="button" disabled={index === effects.length - 1} aria-label={t("production.fx.moveDownNamed", { effect: effect.pluginName })} onClick={() => move(index, 1)}>↓</button>
                <button className="btn" type="button" disabled={openingEditor} onClick={() => void openEditor(effect)}>{t("production.vst3.openEditor")}</button>
                <button className="btn" type="button" aria-label={t("production.vst3.remove")} onClick={() => commit(effects.filter((item) => item.id !== effect.id))}>{t("production.vst3.remove")}</button>
              </div>
              {selectedEffectId === effect.id && selectedDescription && (
                <div className="production-track-vst3-parameters">
                  {selectedDescription.parameters
                    .filter((parameter) => !parameter.readOnly && !parameter.bypass)
                    .map((parameter) => (
                      <label key={parameter.id}>
                        <span>{parameter.name}: {(effect.parameters[String(parameter.id)] ?? parameter.value).toFixed(2)}</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step={parameter.stepCount > 0 ? 1 / parameter.stepCount : 0.001}
                          value={effect.parameters[String(parameter.id)] ?? parameter.value}
                          aria-label={parameter.name}
                          onChange={(event) => patchParameter(effect.id, parameter.id, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  {selectedDescription.parameters.length === 0 && <p className="hint">{t("production.vst3.noParameters")}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {loadingPlugin && <p className="hint" role="status">{t("production.vst3.loading")}</p>}
      {openingEditor && <p className="hint" role="status">{t("production.vst3.editorWaiting")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
