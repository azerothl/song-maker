import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultBus,
  defaultSend,
  validateRoutingGraph,
  type MixBus,
  type MixSend,
  type SidechainRoute,
} from "@song-maker/mix-production";
import type { MixDoc, MixTrack } from "../../lib/types";
import {
  getProductionOverlay,
  newEffectId,
  patchProductionOverlay,
  setSidechainRoutes,
  subscribeProduction,
} from "../../lib/productionState";
import { t } from "../../ui/i18n";
import { ErrorNotice } from "../ErrorNotice";

type Props = {
  track: MixTrack;
  mix: MixDoc;
};

/**
 * Per-track routing tab (planche p5 / #230): group assignment, sends, sidechain.
 * Destination of sidechain routes edited here is always this track.
 */
export function ProductionTrackRoutingPopin({ track, mix }: Props) {
  const [buses, setBuses] = useState<MixBus[]>([]);
  const [sends, setSends] = useState<MixSend[]>([]);
  const [trackGroupIds, setTrackGroupIds] = useState<
    Record<string, string | null>
  >({});
  const [routes, setRoutes] = useState<SidechainRoute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scError, setScError] = useState<string | null>(null);

  const sync = useCallback(() => {
    const o = getProductionOverlay();
    if (!o) {
      setBuses([]);
      setSends([]);
      setTrackGroupIds({});
      setRoutes([]);
      return;
    }
    setBuses(o.buses);
    setSends(o.sends);
    setTrackGroupIds(o.trackGroupIds);
    setRoutes(o.sidechainRoutes);
  }, []);

  useEffect(() => subscribeProduction(sync), [sync]);
  useEffect(() => {
    sync();
  }, [mix.id, track.id, sync]);

  const groups = useMemo(
    () => buses.filter((b) => b.kind === "group"),
    [buses],
  );
  const auxes = useMemo(() => buses.filter((b) => b.kind === "aux"), [buses]);
  const trackSends = useMemo(
    () => sends.filter((s) => s.fromTrackId === track.id),
    [sends, track.id],
  );
  const trackRoutes = useMemo(
    () => routes.filter((r) => r.destinationTrackId === track.id),
    [routes, track.id],
  );

  const commitRouting = (
    nextBuses: MixBus[],
    nextSends: MixSend[],
    nextGroups: Record<string, string | null>,
  ) => {
    const validation = validateRoutingGraph({
      tracks: mix.tracks.map((tr) => ({
        id: tr.id,
        groupId: nextGroups[tr.id] ?? null,
      })),
      buses: nextBuses,
      sends: nextSends,
    });
    if (!validation.ok) {
      setError(validation.issues.map((i) => i.message).join(" "));
    } else {
      setError(null);
    }
    setBuses(validation.recovered.buses);
    setSends(validation.recovered.sends);
    setTrackGroupIds({
      ...nextGroups,
      ...validation.recovered.trackGroupIds,
    });
    patchProductionOverlay({
      mixId: mix.id,
      buses: validation.recovered.buses,
      sends: validation.recovered.sends,
      trackGroupIds: {
        ...nextGroups,
        ...validation.recovered.trackGroupIds,
      },
    });
  };

  const validateRoute = (route: SidechainRoute): string | null => {
    if (route.sourceTrackId === route.destinationTrackId) {
      return t("phase3.mix.sidechainSameTrack");
    }
    const ids = new Set(mix.tracks.map((tr) => tr.id));
    if (!ids.has(route.sourceTrackId) || !ids.has(route.destinationTrackId)) {
      return t("phase3.mix.sidechainMissingTrack");
    }
    return null;
  };

  const persistRoutes = (next: SidechainRoute[]) => {
    setScError(null);
    for (const r of next) {
      const err = validateRoute(r);
      if (err) {
        setScError(err);
        setRoutes(next);
        return;
      }
    }
    setRoutes(next);
    setSidechainRoutes(mix.id, next);
  };

  const addRoute = () => {
    if (mix.tracks.length < 2) {
      setScError(t("phase3.mix.sidechainNeedTracks"));
      return;
    }
    const source =
      mix.tracks.find((tr) => tr.id !== track.id && tr.role.toLowerCase() === "drums") ??
      mix.tracks.find((tr) => tr.id !== track.id)!;
    const route: SidechainRoute = {
      id: newEffectId("compressor").replace("compressor", "sc"),
      sourceTrackId: source.id,
      destinationTrackId: track.id,
      thresholdDb: -24,
      ratio: 4,
      enabled: true,
    };
    persistRoutes([...routes, route]);
  };

  return (
    <div
      className="production-track-routing"
      data-testid="production-track-routing"
    >
      {error && <ErrorNotice message={error} className="error" />}

      <label className="production-track-routing-field">
        <span>{t("phase3.routing.kindGroup")}</span>
        <select
          value={trackGroupIds[track.id] ?? ""}
          aria-label={t("phase3.routing.kindGroup")}
          onChange={(e) => {
            const v = e.target.value || null;
            commitRouting(buses, sends, { ...trackGroupIds, [track.id]: v });
          }}
        >
          <option value="">{t("phase3.routing.noGroup")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <div className="btn-row production-track-routing-bus-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const n = groups.length + 1;
            const bus = defaultBus(
              "group",
              t("production.routing.defaultGroup", { n }),
            );
            commitRouting([...buses, bus], sends, trackGroupIds);
          }}
        >
          {t("phase3.routing.addGroup")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const n = auxes.length + 1;
            const bus = defaultBus(
              "aux",
              t("production.routing.defaultAux", { n }),
            );
            commitRouting([...buses, bus], sends, trackGroupIds);
          }}
        >
          {t("phase3.routing.addAux")}
        </button>
      </div>

      <fieldset className="production-track-routing-sends">
        <legend>{t("production.routing.sendsLegend")}</legend>
        <p className="hint">{t("phase3.routing.sendsHint")}</p>
        {auxes.length === 0 ? (
          <p className="hint">{t("phase3.routing.needAux")}</p>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              commitRouting(
                buses,
                [...sends, defaultSend(track.id, auxes[0]!.id)],
                trackGroupIds,
              );
            }}
          >
            {t("phase3.routing.addSend")}
          </button>
        )}
        <ul className="routing-send-list">
          {trackSends.map((send) => (
            <li key={send.id}>
              <label>
                <span>{t("phase3.routing.kindAux")}</span>
                <select
                  value={send.toBusId}
                  onChange={(e) => {
                    commitRouting(
                      buses,
                      sends.map((s) =>
                        s.id === send.id
                          ? { ...s, toBusId: e.target.value }
                          : s,
                      ),
                      trackGroupIds,
                    );
                  }}
                >
                  {auxes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("phase3.routing.sendGain")}
                <input
                  type="number"
                  step={0.5}
                  value={send.gainDb}
                  onChange={(e) => {
                    const gainDb = Number(e.target.value);
                    commitRouting(
                      buses,
                      sends.map((s) =>
                        s.id === send.id ? { ...s, gainDb } : s,
                      ),
                      trackGroupIds,
                    );
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={send.preFader}
                  onChange={(e) => {
                    commitRouting(
                      buses,
                      sends.map((s) =>
                        s.id === send.id
                          ? { ...s, preFader: e.target.checked }
                          : s,
                      ),
                      trackGroupIds,
                    );
                  }}
                />
                {t("phase3.routing.preFader")}
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  commitRouting(
                    buses,
                    sends.filter((s) => s.id !== send.id),
                    trackGroupIds,
                  );
                }}
              >
                {t("phase3.routing.removeSend")}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="production-track-routing-sidechain">
        <legend>{t("phase3.mix.sidechainLegend")}</legend>
        <p className="hint">{t("phase3.mix.sidechainHint")}</p>
        <button type="button" className="btn" onClick={addRoute}>
          {t("phase3.mix.sidechainAdd")}
        </button>
        {trackRoutes.length === 0 ? (
          <p className="hint">{t("phase3.mix.sidechainEmpty")}</p>
        ) : (
          <ul className="phase3-fx-list">
            {trackRoutes.map((route) => (
              <li key={route.id} className="phase3-fx-item">
                <div className="phase3-fields">
                  <label className="phase3-field">
                    <span>{t("phase3.mix.sidechainSource")}</span>
                    <select
                      value={route.sourceTrackId}
                      onChange={(e) =>
                        persistRoutes(
                          routes.map((r) =>
                            r.id === route.id
                              ? { ...r, sourceTrackId: e.target.value }
                              : r,
                          ),
                        )
                      }
                    >
                      {mix.tracks
                        .filter((tr) => tr.id !== track.id)
                        .map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="hint" role="status">
                    {t("production.routing.sidechainDestFixed")}
                  </p>
                  <label className="phase3-field">
                    <span>{t("phase3.mix.sidechainTriggerLevel")}</span>
                    <input
                      type="number"
                      step={0.5}
                      value={route.thresholdDb}
                      onChange={(e) =>
                        persistRoutes(
                          routes.map((r) =>
                            r.id === route.id
                              ? {
                                  ...r,
                                  thresholdDb: Number(e.target.value),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="phase3-field">
                    <span>{t("phase3.mix.sidechainStrength")}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={1}
                      value={route.ratio}
                      onChange={(e) =>
                        persistRoutes(
                          routes.map((r) =>
                            r.id === route.id
                              ? { ...r, ratio: Number(e.target.value) }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="phase3-fx-item-head">
                  <label className="phase3-check">
                    <input
                      type="checkbox"
                      checked={route.enabled}
                      onChange={(e) =>
                        persistRoutes(
                          routes.map((r) =>
                            r.id === route.id
                              ? { ...r, enabled: e.target.checked }
                              : r,
                          ),
                        )
                      }
                    />
                    <span>{t("phase3.mix.sidechainEnabled")}</span>
                  </label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      persistRoutes(routes.filter((r) => r.id !== route.id))
                    }
                  >
                    {t("phase3.routing.removeSend")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {scError && <p className="hint error">{scError}</p>}
      </fieldset>
    </div>
  );
}
