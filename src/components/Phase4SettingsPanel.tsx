import { useEffect, useMemo, useState } from "react";
import {
  getSharedAkashaHostBridge,
  type HostModeResult,
} from "@song-maker/akasha-declui";
import {
  listStyleLoraPacks,
  gateLoraPackAccess,
  planOptionalLoraDownload,
  type LoraPack,
} from "@song-maker/lora-packs";
import {
  DEFAULT_RETENTION_POLICY,
  createConsent,
  createRemoteGpuWorkerClient,
  resolveAuthPlaceholder,
  REMOTE_WORKER_TOKEN_ENV,
  type RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";
import type { LocalLoraAdapter } from "../lib/types";
import { t } from "../ui/i18n";

const PREFS_KEY = "song-maker.remote-worker.prefs";

function loadPrefs(): RemoteWorkerPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {
        localFirst: true,
        remoteEnabled: false,
        endpointBaseUrl: "",
        accessToken: null,
        retentionAcknowledged: false,
      };
    }
    return { ...JSON.parse(raw), localFirst: true } as RemoteWorkerPreferences;
  } catch {
    return {
      localFirst: true,
      remoteEnabled: false,
      endpointBaseUrl: "",
      accessToken: null,
      retentionAcknowledged: false,
    };
  }
}

function savePrefs(prefs: RemoteWorkerPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function Phase4SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const [prefs, setPrefs] = useState<RemoteWorkerPreferences>(loadPrefs);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [hostResult, setHostResult] = useState<HostModeResult | null>(null);
  const [styleNotice, setStyleNotice] = useState<string | null>(null);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const [arLora, setArLora] = useState("");
  const [narLora, setNarLora] = useState("");
  const [arScale, setArScale] = useState(1);
  const [narScale, setNarScale] = useState(1);
  const [loraNotice, setLoraNotice] = useState<string | null>(null);
  const [localLoras, setLocalLoras] = useState<LocalLoraAdapter[]>([]);

  const bridge = useMemo(() => getSharedAkashaHostBridge(), []);
  const stylePacks = useMemo(() => listStyleLoraPacks(), []);

  useEffect(() => {
    setHostResult({
      ok: true,
      mode: bridge.getMode(),
      messageFr:
        bridge.getMode() === "desktop"
          ? t("phase4.host.desktop")
          : t("phase4.host.enabled"),
      registration: bridge.describe(),
    });
  }, [bridge]);

  useEffect(() => {
    setArLora(settings?.yue2ArLora ?? "");
    setNarLora(settings?.yue2NarLora ?? "");
    setArScale(settings?.yue2ArLoraScale ?? 1);
    setNarScale(settings?.yue2NarLoraScale ?? 1);
  }, [settings]);

  useEffect(() => {
    void api.listLoraAdapters().then(setLocalLoras).catch((e) => setLoraNotice(String(e)));
  }, [settings?.cacheDir]);

  const saveLoraSettings = async () => {
    if (!settings) return;
    try {
      await api.updateSettings({
        ...settings,
        yue2ArLora: arLora.trim() || null,
        yue2NarLora: narLora.trim() || null,
        yue2ArLoraScale: arScale,
        yue2NarLoraScale: narScale,
      });
      await refreshSettings();
      setLoraNotice(t("phase4.lora.saved"));
    } catch (e) {
      setLoraNotice(String(e));
    }
  };

  const updatePrefs = (patch: Partial<RemoteWorkerPreferences>) => {
    const next = { ...prefs, ...patch, localFirst: true };
    setPrefs(next);
    savePrefs(next);
  };

  const onProbeRemote = async () => {
    const auth = resolveAuthPlaceholder({ accessToken: prefs.accessToken });
    const client = createRemoteGpuWorkerClient({
      localFirst: true,
      remoteEnabled: prefs.remoteEnabled,
      accessToken: auth.accessToken,
      retentionAcknowledged: prefs.retentionAcknowledged,
    });
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: {
        baseUrl: prefs.endpointBaseUrl || "https://worker.example.invalid",
        requireTls: true,
      },
      auth,
      consent: createConsent({
        userConsented: prefs.remoteEnabled,
        scope: "generation",
        retentionAcknowledged: prefs.retentionAcknowledged,
      }),
      payload: {
        cipherPath: "blob://probe",
        contentSha256: "0".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    setProbeMsg(
      result.status === "queued"
        ? t("phase4.remote.probeQueued", { id: result.id })
        : `${result.status}: ${result.error ?? ""}`,
    );
  };

  const onToggleHost = async (enable: boolean) => {
    if (enable) {
      setHostResult(await bridge.enableHostMode());
    } else {
      setHostResult(bridge.disableHostMode());
    }
  };

  const onPlanStyle = (pack: LoraPack) => {
    const acceptance = {
      ccByNcAccepted: Boolean(settings?.ccByNcAccepted),
      allowCommercialRedistribution: false,
    };
    const gated = gateLoraPackAccess(pack.id, acceptance);
    if (!gated.ok) {
      setStyleNotice(gated.message);
      return;
    }
    const planned = planOptionalLoraDownload(pack.id, acceptance);
    if (!planned.ok || !planned.plan) {
      setStyleNotice(!planned.ok ? planned.message : t("phase3.lora.planFailed"));
      return;
    }
    const lines = planned.plan.files
      .map((f) => `• ${f.filename}\n  ${f.url}`)
      .join("\n");
    setStyleNotice(
      `${planned.plan.noticeFr}\n\n${lines}\n\n${t("phase3.lora.manualDownload")}`,
    );
  };

  return (
    <section className="phase4-panel" aria-labelledby="phase4-settings-title">
      <h2 id="phase4-settings-title">{t("phase4.settings.title")}</h2>
      <p className="hint">{t("phase4.settings.intro")}</p>

      <h3>{t("phase4.remote.title")}</h3>
      <p className="hint">{DEFAULT_RETENTION_POLICY.messageFr}</p>
      <label className="phase3-check">
        <input
          type="checkbox"
          checked={prefs.remoteEnabled}
          onChange={(e) =>
            updatePrefs({
              remoteEnabled: e.target.checked,
              // Turning off clears consent path noise
            })
          }
        />
        {t("phase4.remote.enable")}
      </label>
      <label className="phase3-check">
        <input
          type="checkbox"
          checked={prefs.retentionAcknowledged}
          onChange={(e) =>
            updatePrefs({ retentionAcknowledged: e.target.checked })
          }
        />
        {t("phase4.remote.retentionAck")}
      </label>
      <label className="invariant-level">
        {t("phase4.remote.endpoint")}
        <input
          type="url"
          value={prefs.endpointBaseUrl}
          placeholder="https://…"
          onChange={(e) => updatePrefs({ endpointBaseUrl: e.target.value })}
        />
      </label>
      <label className="invariant-level">
        {t("phase4.remote.token")}
        <input
          type="password"
          autoComplete="off"
          value={prefs.accessToken ?? ""}
          placeholder={REMOTE_WORKER_TOKEN_ENV}
          onChange={(e) =>
            updatePrefs({ accessToken: e.target.value || null })
          }
        />
      </label>
      <p className="hint">
        {t("phase4.remote.tokenHint", { env: REMOTE_WORKER_TOKEN_ENV })}
      </p>
      <button
        type="button"
        className="btn"
        disabled={!prefs.remoteEnabled}
        onClick={() => void onProbeRemote()}
      >
        {t("phase4.remote.probe")}
      </button>
      {probeMsg && <pre className="phase3-download-notice">{probeMsg}</pre>}

      <h3>{t("phase4.host.title")}</h3>
      <p className="hint">{t("phase4.host.intro")}</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => void onToggleHost(true)}
        >
          {t("phase4.host.enable")}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void onToggleHost(false)}
        >
          {t("phase4.host.disable")}
        </button>
      </div>
      {hostResult && <p className="hint ok">{hostResult.messageFr}</p>}
      <details>
        <summary>{t("phase4.host.describe")}</summary>
        <pre className="phase3-download-notice">
          {JSON.stringify(bridge.describe(), null, 2)}
        </pre>
      </details>

      <h3>{t("phase4.styleLora.title")}</h3>
      <p className="hint">{t("phase4.styleLora.intro")}</p>
      <div className="phase4-lora-active">
        <h4>{t("phase4.lora.activeTitle")}</h4>
        <p className="hint">{t("phase4.lora.localHint")}</p>
        <label className="invariant-level">
          {t("phase4.lora.arPath")}
          <select value={arLora} onChange={(e) => setArLora(e.target.value)}>
            <option value="">{t("phase4.lora.none")}</option>
            {arLora && !localLoras.some((adapter) => adapter.path === arLora) && <option value={arLora}>{arLora}</option>}
            {localLoras.map((adapter) => <option key={adapter.path} value={adapter.path}>{adapter.name}</option>)}
          </select>
        </label>
        <label className="invariant-level">
          {t("phase4.lora.arScale")}
          <input type="number" min={0} max={2} step={0.05} value={arScale} onChange={(e) => setArScale(Number(e.target.value))} />
        </label>
        <label className="invariant-level">
          {t("phase4.lora.narPath")}
          <select value={narLora} onChange={(e) => setNarLora(e.target.value)}>
            <option value="">{t("phase4.lora.none")}</option>
            {narLora && !localLoras.some((adapter) => adapter.path === narLora) && <option value={narLora}>{narLora}</option>}
            {localLoras.map((adapter) => <option key={adapter.path} value={adapter.path}>{adapter.name}</option>)}
          </select>
        </label>
        <label className="invariant-level">
          {t("phase4.lora.narScale")}
          <input type="number" min={0} max={2} step={0.05} value={narScale} onChange={(e) => setNarScale(Number(e.target.value))} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={() => void api.listLoraAdapters().then(setLocalLoras).catch((e) => setLoraNotice(String(e)))}>{t("phase4.lora.reload")}</button>
          <span className="hint">{t("phase4.lora.count", { count: String(localLoras.length) })}</span>
        </div>
        <button type="button" className="btn" onClick={() => void saveLoraSettings()}>{t("phase4.lora.save")}</button>
        {loraNotice && <p className="hint" role="status">{loraNotice}</p>}
      </div>
      <ul className="phase3-lora-list">
        {stylePacks.map((pack) => (
          <li key={pack.id}>
            <div>
              <strong>{pack.displayName}</strong>
              <span className="hint">
                {" "}
                · {pack.license} · {pack.repo}
              </span>
              {pack.trigger && (
                <span className="hint"> · trigger « {pack.trigger} »</span>
              )}
              <br />
              <span className="hint">{pack.notes}</span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => onPlanStyle(pack)}
            >
              {t("phase3.lora.planDownload")}
            </button>
          </li>
        ))}
      </ul>
      {styleNotice && (
        <pre className="phase3-download-notice">{styleNotice}</pre>
      )}
    </section>
  );
}
