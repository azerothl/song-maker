import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

type Status = { enabled: boolean; isHost: boolean; notesFr: string };
type Entry = { path: string; name: string; binaryPath: string | null };

/**
 * Visible only when SONG_MAKER_VST3_SPIKE=1.
 * Must never read as « VST disponible » in the product mixer.
 */
export function Vst3SpikePanel() {
  const project = useAppStore((s) => s.project);
  const mix = useAppStore((s) => s.mix);
  const setMix = useAppStore((s) => s.setMix);
  const [status, setStatus] = useState<Status | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .vst3SpikeStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, isHost: false, notesFr: "" }));
  }, []);

  if (!status?.enabled || status.isHost) {
    return null;
  }

  const onScan = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setEntries(await api.vst3SpikeScan());
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLoad = async (path: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const loaded = await api.vst3SpikeLoad(path);
      const trackId = mix?.tracks[0]?.id;
      if (project && trackId) {
        const next = await api.vst3SpikeAttach(project.id, trackId, path);
        setMix(next);
        setNotice(
          `${loaded.notesFr} Insert métadonnée sur ${trackId} (bake inchangé).`,
        );
      } else {
        setNotice(loaded.notesFr);
      }
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="phase4-panel" aria-labelledby="vst3-spike-title">
      <h3 id="vst3-spike-title">{t("vst3.spike.title")}</h3>
      <p className="hint">{status.notesFr}</p>
      <button type="button" className="btn" disabled={busy} onClick={() => void onScan()}>
        {t("vst3.spike.scan")}
      </button>
      <ul className="phase3-lora-list">
        {entries.map((e) => (
          <li key={e.path}>
            <div>
              <strong>{e.name}</strong>
              <span className="hint"> · {e.path}</span>
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void onLoad(e.binaryPath ?? e.path)}
            >
              {t("vst3.spike.load")}
            </button>
          </li>
        ))}
      </ul>
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
