import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultBus,
  defaultSend,
  validateRoutingGraph,
  type MixBus,
  type MixSend,
} from "@song-maker/mix-production";
import type { MixDoc } from "../lib/types";
import {
  getProductionOverlay,
  patchProductionOverlay,
  subscribeProduction,
} from "../lib/productionState";
import { t } from "../ui/i18n";
import { ErrorNotice } from "./ErrorNotice";

type Props = {
  mix: MixDoc | null;
};

/**
 * Group / aux buses and pre/post-fader sends (#98).
 */
export function RoutingPanel({ mix }: Props) {
  const [buses, setBuses] = useState<MixBus[]>([]);
  const [sends, setSends] = useState<MixSend[]>([]);
  const [trackGroupIds, setTrackGroupIds] = useState<
    Record<string, string | null>
  >({});
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(() => {
    const o = getProductionOverlay();
    if (!o) {
      setBuses([]);
      setSends([]);
      setTrackGroupIds({});
      return;
    }
    setBuses(o.buses);
    setSends(o.sends);
    setTrackGroupIds(o.trackGroupIds);
  }, []);

  useEffect(() => subscribeProduction(sync), [sync]);
  useEffect(() => {
    if (mix) sync();
  }, [mix?.id, mix, sync]);

  const groups = useMemo(
    () => buses.filter((b) => b.kind === "group"),
    [buses],
  );
  const auxes = useMemo(() => buses.filter((b) => b.kind === "aux"), [buses]);

  const commit = (
    nextBuses: MixBus[],
    nextSends: MixSend[],
    nextGroups: Record<string, string | null>,
  ) => {
    if (!mix) return;
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

  if (!mix) {
    return <p className="hint">{t("phase3.mix.needMix")}</p>;
  }

  return (
    <section className="routing-panel" aria-label={t("phase3.routing.title")}>
      <header>
        <h3>{t("phase3.routing.title")}</h3>
        <p className="hint">{t("phase3.routing.intro")}</p>
      </header>

      {error && <ErrorNotice message={error} className="error" />}

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const bus = defaultBus(
              "group",
              t("production.routing.defaultGroup", { n: groups.length + 1 }),
            );
            commit([...buses, bus], sends, trackGroupIds);
          }}
        >
          {t("phase3.routing.addGroup")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const bus = defaultBus(
              "aux",
              t("production.routing.defaultAux", { n: auxes.length + 1 }),
            );
            commit([...buses, bus], sends, trackGroupIds);
          }}
        >
          {t("phase3.routing.addAux")}
        </button>
      </div>

      <fieldset>
        <legend>{t("phase3.routing.buses")}</legend>
        {buses.length === 0 && (
          <p className="hint">{t("phase3.routing.busesEmpty")}</p>
        )}
        <ul className="routing-bus-list">
          {buses.map((bus) => (
            <li key={bus.id}>
              <strong>
                {bus.kind === "group"
                  ? t("phase3.routing.kindGroup")
                  : t("phase3.routing.kindAux")}{" "}
                — {bus.name}
              </strong>
              <label>
                {t("phase3.routing.gainDb")}
                <input
                  type="number"
                  step={0.5}
                  value={bus.gainDb}
                  onChange={(e) => {
                    const gainDb = Number(e.target.value);
                    commit(
                      buses.map((b) =>
                        b.id === bus.id ? { ...b, gainDb } : b,
                      ),
                      sends,
                      trackGroupIds,
                    );
                  }}
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const nextBuses = buses.filter((b) => b.id !== bus.id);
                  const nextSends = sends.filter((s) => s.toBusId !== bus.id);
                  const nextGroups = { ...trackGroupIds };
                  for (const [k, v] of Object.entries(nextGroups)) {
                    if (v === bus.id) nextGroups[k] = null;
                  }
                  commit(nextBuses, nextSends, nextGroups);
                }}
              >
                {t("phase3.routing.removeBus")}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>{t("phase3.routing.trackGroups")}</legend>
        <ul className="routing-track-list">
          {mix.tracks.map((tr) => (
            <li key={tr.id}>
              <span>{tr.name}</span>
              <select
                value={trackGroupIds[tr.id] ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  commit(buses, sends, { ...trackGroupIds, [tr.id]: v });
                }}
              >
                <option value="">{t("phase3.routing.noGroup")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>{t("phase3.routing.sends")}</legend>
        <p className="hint">{t("phase3.routing.sendsHint")}</p>
        {auxes.length === 0 ? (
          <p className="hint">{t("phase3.routing.needAux")}</p>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={mix.tracks.length === 0}
            onClick={() => {
              const from = mix.tracks[0]!.id;
              const to = auxes[0]!.id;
              commit(buses, [...sends, defaultSend(from, to)], trackGroupIds);
            }}
          >
            {t("phase3.routing.addSend")}
          </button>
        )}
        <ul className="routing-send-list">
          {sends.map((send) => (
            <li key={send.id}>
              <select
                value={send.fromTrackId}
                onChange={(e) => {
                  commit(
                    buses,
                    sends.map((s) =>
                      s.id === send.id
                        ? { ...s, fromTrackId: e.target.value }
                        : s,
                    ),
                    trackGroupIds,
                  );
                }}
              >
                {mix.tracks.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
              <span>→</span>
              <select
                value={send.toBusId}
                onChange={(e) => {
                  commit(
                    buses,
                    sends.map((s) =>
                      s.id === send.id ? { ...s, toBusId: e.target.value } : s,
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
              <label>
                {t("phase3.routing.sendGain")}
                <input
                  type="number"
                  step={0.5}
                  value={send.gainDb}
                  onChange={(e) => {
                    const gainDb = Number(e.target.value);
                    commit(
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
                    commit(
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
                  commit(
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
    </section>
  );
}
