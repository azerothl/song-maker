import { useEffect, useMemo, useState } from "react";
import {
  AKASHA_HOST_TOKEN_ENV,
  AKASHA_HOST_URL_ENV,
  getSharedAkashaHostBridge,
  type HostModeResult,
} from "@song-maker/akasha-declui";
import {
  LORA_PACK_CATALOG,
  gateLoraPackAccess,
  planOptionalLoraDownload,
  requestOptionalLoraDownload,
  activateLoraPackSettings,
  compatibilityLabelFr,
  type LoraPack,
} from "@song-maker/lora-packs";
import {
  DEFAULT_RETENTION_POLICY,
  buildProjectPayload,
  createRemoteGpuWorkerClient,
  resolveAuthPlaceholder,
  REMOTE_WORKER_TOKEN_ENV,
  type RemoteWorkerPreferences,
} from "@song-maker/remote-worker";
import { useAppStore } from "../store/appStore";
import { api } from "../lib/api";
import { REMOTE_PREFS_KEY } from "../lib/remoteGenerate";
import type { LocalLoraAdapter } from "../lib/types";
import { t } from "../ui/i18n";
import { adapterActive, adapterPath, packLibraryState } from "../lib/loraLibrary";

const PREFS_KEY = REMOTE_PREFS_KEY;

function packDescription(id: string): string {
  switch (id) {
    case "mothersuperior-instrumental-ar": return t("phase4.lora.description.mothersuperior-instrumental-ar");
    case "mothersuperior-realaudio-nar-v4": return t("phase4.lora.description.mothersuperior-realaudio-nar-v4");
    case "becausereasons-chnsn-chanson-francaise": return t("phase4.lora.description.becausereasons-chnsn-chanson-francaise");
    default: return t("phase4.lora.description.monsterovich-industrial-rock");
  }
}

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

export function Phase4SettingsPanel({
  view,
}: {
  view: "remote" | "host" | "lora";
}) {
  const settings = useAppStore((s) => s.settings);
  const [prefs, setPrefs] = useState<RemoteWorkerPreferences>(loadPrefs);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [hostResult, setHostResult] = useState<HostModeResult | null>(null);
  const [hostUrl, setHostUrl] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [styleNotice, setStyleNotice] = useState<string | null>(null);
  const [styleBusyId, setStyleBusyId] = useState<string | null>(null);
  const [styleOperation, setStyleOperation] = useState<"download" | "activate" | null>(null);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const [arLora, setArLora] = useState("");
  const [narLora, setNarLora] = useState("");
  const [arScale, setArScale] = useState(1);
  const [narScale, setNarScale] = useState(1);
  const [loraNotice, setLoraNotice] = useState<string | null>(null);
  const [localLoras, setLocalLoras] = useState<LocalLoraAdapter[]>([]);
  const [importingLoras, setImportingLoras] = useState(false);

  const bridge = useMemo(() => getSharedAkashaHostBridge(), []);
  const stylePacks = LORA_PACK_CATALOG;

  useEffect(() => {
    const mode = bridge.getMode();
    setHostResult({
      ok: mode === "connected",
      mode,
      messageFr:
        mode === "desktop"
          ? t("phase4.host.desktop")
          : mode === "connected"
            ? t("phase4.host.connected")
            : t("phase4.host.unavailable"),
      registration: bridge.describe(),
      hostUrl: bridge.getHostUrl(),
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

  const importLoras = async () => {
    setImportingLoras(true);
    setLoraNotice(null);
    try {
      const adapters = await api.importLoraAdapters();
      if (adapters) {
        setLocalLoras(adapters);
        setLoraNotice(
          t("phase4.lora.imported", { count: String(adapters.length) }),
        );
      }
    } catch (e) {
      setLoraNotice(String(e));
    } finally {
      setImportingLoras(false);
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
      endpointBaseUrl: prefs.endpointBaseUrl,
      accessToken: auth.accessToken,
      retentionAcknowledged: prefs.retentionAcknowledged,
    });
    // Real hashed probe payload (not blob://probe zeros).
    const built = await buildProjectPayload({
      projectId: "settings-probe",
      kind: "yue2_generate",
      accessToken: auth.accessToken,
      request: { probe: true, style: "probe", lyrics: "[Probe]\n" },
    });
    const health = await client.probe();
    if (health.status === "succeeded") {
      setProbeMsg(
        t("phase4.remote.probeOk", {
          sha: built.plaintextSha256.slice(0, 16),
          enc: built.blob.encryption,
        }),
      );
      return;
    }
    setProbeMsg(
      `${health.status}: ${health.error ?? ""}\n` +
        t("phase4.remote.probeContract") +
        `\npayload sha=${built.plaintextSha256.slice(0, 16)}… (${built.blob.byteLength ?? 0} o)`,
    );
  };

  const onStartEmbeddedHost = async () => {
    try {
      const status = await api.startEmbeddedDeclUiHost();
      if (status.url) {
        setHostUrl(status.url);
      }
      setHostResult({
        ok: false,
        mode: "desktop",
        messageFr: status.notesFr,
        registration: bridge.describe(),
        hostUrl: status.url,
      });
    } catch (e) {
      setHostResult({
        ok: false,
        mode: "unavailable",
        messageFr: String(e),
        registration: bridge.describe(),
        hostUrl: null,
      });
    }
  };

  const onStopEmbeddedHost = async () => {
    try {
      await api.stopEmbeddedDeclUiHost();
      setHostResult(bridge.disableHostMode());
    } catch (e) {
      setHostResult({
        ok: false,
        mode: bridge.getMode(),
        messageFr: String(e),
        registration: bridge.describe(),
        hostUrl: bridge.getHostUrl(),
      });
    }
  };

  const onToggleHost = async (enable: boolean) => {
    if (enable) {
      setHostResult(
        await bridge.enableHostMode({
          hostOptIn: true,
          hostUrl: hostUrl.trim(),
          accessToken: hostToken.trim() || null,
        }),
      );
    } else {
      setHostResult(bridge.disableHostMode());
    }
  };

  const styleAcceptance = () => ({
    ccByNcAccepted: Boolean(settings?.ccByNcAccepted),
    allowCommercialRedistribution: false,
  });

  const toggleCcByNc = async (accepted: boolean) => {
    if (!settings) return;
    try {
      await api.updateSettings({ ...settings, ccByNcAccepted: accepted });
      await refreshSettings();
      setStyleNotice(
        accepted
          ? t("phase4.styleLora.ccAccepted")
          : t("phase4.styleLora.ccCleared"),
      );
    } catch (e) {
      setStyleNotice(String(e));
    }
  };

  const onPlanStyle = (pack: LoraPack) => {
    const acceptance = styleAcceptance();
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
      .map(
        (f) =>
          `• ${f.filename}${f.sha256 ? ` (sha256 ${f.sha256.slice(0, 12)}…)` : ""}\n  ${f.url}\n  → cache/${f.relativeCachePath}`,
      )
      .join("\n");
    setStyleNotice(
      `${planned.plan.noticeFr}\n\n${lines}\n\n${t("phase3.lora.manualDownload")}`,
    );
  };

  const onDownloadStyle = async (pack: LoraPack) => {
    setStyleOperation("download");
    setStyleBusyId(pack.id);
    setStyleNotice(null);
    try {
      const result = await requestOptionalLoraDownload(
        pack.id,
        styleAcceptance(),
        (url, relativeCachePath, expectedSha256) =>
          api.downloadCacheFile(url, relativeCachePath, expectedSha256),
      );
      if (!result.ok) {
        setStyleNotice(result.message);
        return;
      }
      setStyleNotice(
        t("phase4.styleLora.downloadHintActivate"),
      );
      const adapters = await api.listLoraAdapters();
      setLocalLoras(adapters);
    } catch (e) {
      setStyleNotice(String(e));
    } finally {
      setStyleBusyId(null);
    }
  };

  const onActivateStyle = async (pack: LoraPack) => {
    if (!settings) return;
    setStyleOperation("activate");
    setStyleBusyId(pack.id);
    setStyleNotice(null);
    try {
      const gated = gateLoraPackAccess(pack.id, styleAcceptance());
      if (!gated.ok) {
        setStyleNotice(gated.message);
        return;
      }
      const cacheRoot = settings.cacheDir.replace(/[/\\]+$/, "");
      const localPaths: Partial<Record<"ar" | "nar", string>> = {};
      for (const file of pack.files) {
        const abs = `${cacheRoot}/models/lora/${pack.id}/${file.filename}`;
        localPaths[file.slot] = abs;
      }
      const patch = activateLoraPackSettings(pack, localPaths, {
        ar: arScale,
        nar: narScale,
      });
      if (!patch.yue2ArLora && !patch.yue2NarLora) {
        setStyleNotice(t("phase4.styleLora.activateMissing"));
        return;
      }
      await api.updateSettings({
        ...settings,
        ...patch,
      });
      await refreshSettings();
      setArLora(patch.yue2ArLora ?? "");
      setNarLora(patch.yue2NarLora ?? "");
      setArScale(patch.yue2ArLoraScale);
      setNarScale(patch.yue2NarLoraScale);
      const adapters = await api.listLoraAdapters();
      setLocalLoras(adapters);
      setStyleNotice(
        t("phase4.styleLora.activated", { name: pack.displayName }),
      );
    } catch (e) {
      setStyleNotice(
        `${String(e)}\n${t("phase4.styleLora.activateFailed")}`,
      );
    } finally {
      setStyleBusyId(null);
    }
  };

  const onDeactivateStyle = async () => {
    if (!settings) return;
    try {
      await api.updateSettings({
        ...settings,
        yue2ArLora: null,
        yue2NarLora: null,
        yue2ArLoraScale: 1,
        yue2NarLoraScale: 1,
      });
      await refreshSettings();
      setArLora("");
      setNarLora("");
      setArScale(1);
      setNarScale(1);
      setStyleNotice(t("phase4.styleLora.deactivated"));
    } catch (e) {
      setStyleNotice(String(e));
    }
  };

  return (
    <section
      className="phase4-panel"
      aria-labelledby={view === "lora" ? "lora-library-title" : `phase4-settings-title-${view}`}
    >
      {view !== "lora" && <h2 id={`phase4-settings-title-${view}`}>
        {view === "remote"
          ? t("phase4.remote.title")
          : view === "host"
            ? t("phase4.host.title")
            : t("phase4.styleLora.title")}
      </h2>}
      {view !== "lora" && <p className="hint">{t("phase4.settings.intro")}</p>}

      {view === "remote" && (
        <div className="settings-page-content">
      <p className="hint">{DEFAULT_RETENTION_POLICY.messageFr}</p>
      <p className="hint">{t("phase4.remote.contractHint")}</p>
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
        </div>
      )}

      {view === "host" && (
        <div className="settings-page-content">
      <p className="hint">{t("phase4.host.intro")}</p>
      <p className="hint">{t("phase4.host.embeddedIntro")}</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => void onStartEmbeddedHost()}
        >
          {t("phase4.host.embeddedStart")}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void onStopEmbeddedHost()}
        >
          {t("phase4.host.embeddedStop")}
        </button>
      </div>
      <label className="invariant-level">
        {t("phase4.host.endpoint")}
        <input
          type="url"
          value={hostUrl}
          placeholder="https://…"
          onChange={(e) => setHostUrl(e.target.value)}
        />
      </label>
      <label className="invariant-level">
        {t("phase4.host.token")}
        <input
          type="password"
          autoComplete="off"
          value={hostToken}
          placeholder={AKASHA_HOST_TOKEN_ENV}
          onChange={(e) => setHostToken(e.target.value)}
        />
      </label>
      <p className="hint">
        {t("phase4.host.envHint", {
          urlEnv: AKASHA_HOST_URL_ENV,
          tokenEnv: AKASHA_HOST_TOKEN_ENV,
        })}
      </p>
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
      {hostResult && (
        <p className={`hint ${hostResult.ok ? "ok" : ""}`}>
          {hostResult.messageFr}
        </p>
      )}
      <details>
        <summary>{t("phase4.host.describe")}</summary>
        <pre className="phase3-download-notice">
          {JSON.stringify(bridge.describe(), null, 2)}
        </pre>
      </details>
        </div>
      )}

      {view === "lora" && (
        <div className="settings-page-content">
      <p className="hint">{t("phase4.styleLora.intro")}</p>
      <div className="phase4-lora-active">
        <h2 id="lora-library-title">{t("phase4.lora.activeTitle")}</h2>
        <div className="btn-row">
          <button type="button" className="btn" disabled={importingLoras} onClick={() => void importLoras()}>
            {importingLoras ? t("phase4.lora.importing") : t("phase4.lora.import")}
          </button>
          <button type="button" className="btn ghost" disabled={importingLoras} onClick={() => void api.listLoraAdapters().then(setLocalLoras).catch((e) => setLoraNotice(String(e)))}>{t("phase4.lora.reload")}</button>
        </div>
        <p className="hint">{t("phase4.lora.importHint")}</p>
        {localLoras.length === 0 ? <p role="status">{t("phase4.lora.empty")}</p> : (
          <ul className="phase3-lora-list">
            {localLoras.map(adapter => <li key={adapter.path}>
              <strong>{adapter.name}</strong>{" · "}
              <span>{t(settings && adapterActive(adapter.path, settings) ? "phase4.lora.active" : "phase4.lora.installed")}</span>
            </li>)}
          </ul>
        )}
        {(localLoras.length > 0 || arLora || narLora) && <>
        <h3>{t("phase4.lora.useTitle")}</h3>
        <p className="hint">{t("phase4.lora.localHint")}</p>
        <label className="invariant-level">
          {t("phase4.lora.arPath")}
          <select value={adapterPath(arLora)} onChange={(e) => setArLora(e.target.value)}>
            <option value="">{t("phase4.lora.none")}</option>
            {arLora && !localLoras.some((adapter) => adapterPath(adapter.path) === adapterPath(arLora)) && <option value={adapterPath(arLora)}>{arLora.split(/[/\\]/).pop()}</option>}
            {localLoras.map((adapter) => <option key={adapter.path} value={adapterPath(adapter.path)}>{adapter.name}</option>)}
          </select>
        </label>
        <label className="invariant-level">
          {t("phase4.lora.narPath")}
          <select value={adapterPath(narLora)} onChange={(e) => setNarLora(e.target.value)}>
            <option value="">{t("phase4.lora.none")}</option>
            {narLora && !localLoras.some((adapter) => adapterPath(adapter.path) === adapterPath(narLora)) && <option value={adapterPath(narLora)}>{narLora.split(/[/\\]/).pop()}</option>}
            {localLoras.map((adapter) => <option key={adapter.path} value={adapterPath(adapter.path)}>{adapter.name}</option>)}
          </select>
        </label>
        <details><summary>{t("phase4.lora.intensity")}</summary>
        <label className="invariant-level">
          {t("phase4.lora.arScale")}
          <input type="number" min={0} max={2} step={0.05} value={arScale} onChange={(e) => setArScale(Number(e.target.value))} />
        </label>
        <label className="invariant-level">
          {t("phase4.lora.narScale")}
          <input type="number" min={0} max={2} step={0.05} value={narScale} onChange={(e) => setNarScale(Number(e.target.value))} />
        </label>
        </details>
        <div className="btn-row"><button type="button" className="btn ghost" onClick={() => void onDeactivateStyle()}>{t("phase4.styleLora.deactivate")}</button></div>
        <button type="button" className="btn" onClick={() => void saveLoraSettings()}>{t("phase4.lora.save")}</button>
        </>}
        {loraNotice && <p className="hint" role="status">{loraNotice}</p>}
      </div>
      <h2>{t("phase4.lora.catalogTitle")}</h2>
      <p className="hint">
        {t("phase4.styleLora.licenseNotice")}{" "}
        <span className="nc-model-badge" data-testid="style-lora-nc-badge">
          <span className="sep-license-icon" aria-hidden="true">
            ⊘
          </span>
          {t("phase4.styleLora.ncBadge")}
        </span>
      </p>
      <label className="phase3-check" htmlFor="phase4-lora-cc-gate">
        <input
          id="phase4-lora-cc-gate"
          type="checkbox"
          checked={Boolean(settings?.ccByNcAccepted)}
          onChange={(e) => void toggleCcByNc(e.target.checked)}
        />
        {t("phase3.lora.ccGate")}
      </label>
      <ul className="phase3-lora-list">
        {stylePacks.map((pack) => {
          const installable = pack.compatibilityStatus === "verified";
          const busy = styleBusyId === pack.id;
          const local = settings ? packLibraryState(pack, localLoras, settings) : { installed: false, active: false };
          return (
          <li key={pack.id}>
            <div>
              <strong>{pack.displayName}</strong>
              <p>{packDescription(pack.id)}</p>
              <p role="status">{t(!installable ? "phase4.lora.notReady" : local.active ? "phase4.lora.active" : local.installed ? "phase4.lora.installed" : "phase4.lora.notInstalled")}</p>
              <details><summary>{t("phase4.lora.sourceDetails")}</summary>
                <p>{compatibilityLabelFr(pack.compatibilityStatus)} · {pack.license}</p>
                <a href={`https://huggingface.co/${pack.repo}`} target="_blank" rel="noreferrer">{pack.repo}</a>
                {pack.trigger && <p>{t("phase4.lora.trigger", { trigger: pack.trigger })}</p>}
                {installable && <button type="button" className="btn ghost" disabled={Boolean(styleBusyId)} onClick={() => onPlanStyle(pack)}>{t("phase3.lora.planDownload")}</button>}
              </details>
            </div>
            {installable && <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                disabled={
                  Boolean(styleBusyId) ||
                  local.installed ||
                  !settings?.ccByNcAccepted
                }
                onClick={() => void onDownloadStyle(pack)}
              >
                {busy && styleOperation === "download"
                  ? t("phase3.lora.downloading")
                  : t("phase3.lora.download")}
              </button>
              <button
                type="button"
                className="btn"
                disabled={
                  Boolean(styleBusyId) ||
                  !local.installed || local.active ||
                  !settings?.ccByNcAccepted
                }
                onClick={() => void onActivateStyle(pack)}
              >
                {t(busy && styleOperation === "activate" ? "phase4.lora.activating" : "phase4.styleLora.activate")}
              </button>
            </div>}
          </li>
          );
        })}
      </ul>
      {styleNotice && (styleNotice.includes("\n") ? (
        <details><summary>{t("phase4.lora.sourceDetails")}</summary><pre className="phase3-download-notice">{styleNotice}</pre></details>
      ) : <p role="status">{styleNotice}</p>)}
        </div>
      )}
    </section>
  );
}
