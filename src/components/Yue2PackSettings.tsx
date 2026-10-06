import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import {
  clearMixOnlySkip,
  formatBytesFr,
  HTDEMUCS_LICENSE_URL,
  htdemucsLicenseAllowsDownload,
  licenseAllowsDownload,
  modelPackVramFailureRisk,
  packModelBytes,
  parsePack,
  YUE2_LICENSE_URL,
  yue2PackNeedsInstall,
  type ModelPack,
} from "../lib/firstLaunch";
import { isTauriRuntime } from "../lib/runtimeHost";
import type { InstallProgress } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

function invokeError(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

function packLabel(pack: ModelPack): string {
  return t(pack === "q8" ? "settings.model.q8" : "settings.model.q4");
}

function downloadLabel(pack: ModelPack, installing: boolean): string {
  if (installing) return t("settings.model.downloading");
  return t("settings.model.downloadSize", {
    pack: packLabel(pack),
    size: formatBytesFr(packModelBytes(pack)),
  });
}

export function Yue2PackSettings() {
  const settings = useAppStore((s) => s.settings);
  const health = useAppStore((s) => s.health);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const refreshHealth = useAppStore((s) => s.refreshHealth);
  const setError = useAppStore((s) => s.setError);
  const [pack, setPack] = useState<ModelPack>(parsePack(settings?.modelPack));
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [yue2Checked, setYue2Checked] = useState(false);
  const [htdemucsChecked, setHtdemucsChecked] = useState(false);

  useEffect(() => {
    if (installing) return;
    setPack(parsePack(settings?.modelPack));
  }, [settings?.modelPack, installing]);

  const packInstalled =
    health != null &&
    !yue2PackNeedsInstall({
      selected: pack,
      activePack: settings?.modelPack,
      modelsOk: health.modelsOk,
      localYue2Enabled: health.localYue2Enabled,
    });
  const needsInstall = !packInstalled;

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("setup-progress", (event) => {
      setProgress(event.payload);
    }).then((release) => {
      unlisten = release;
    });
    return () => unlisten?.();
  }, []);

  if (!settings) return null;

  const modelReady = Boolean(health?.localYue2Enabled && health.modelsOk);
  const yue2Ok = licenseAllowsDownload(yue2Checked, settings.yue2LicenseAccepted);
  const htdemucsOk = htdemucsLicenseAllowsDownload(
    htdemucsChecked,
    settings.acceptedSeparatorLicenses?.htdemucs,
  );
  const ratioBase = progress?.overallTotalBytes ?? progress?.totalBytes ?? 0;
  const ratioGot = progress?.overallReceivedBytes ?? progress?.receivedBytes ?? 0;
  const downloadPercent =
    ratioBase > 0 ? Math.min(100, Math.round((ratioGot / ratioBase) * 100)) : null;

  const download = async () => {
    setInstalling(true);
    setError(null);
    setProgress(null);
    try {
      if (!settings.acceptedSeparatorLicenses?.htdemucs) {
        await api.updateSettings({
          ...settings,
          acceptedSeparatorLicenses: {
            ...(settings.acceptedSeparatorLicenses ?? {}),
            htdemucs: true,
          },
        });
        await refreshSettings();
      }
      await api.installRequiredAssets(pack, yue2Ok);
      clearMixOnlySkip();
      await Promise.all([refreshHealth(), refreshSettings()]);
      setProgress(null);
    } catch (reason) {
      setError(invokeError(reason));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <p className="settings-intro">{t("settings.model.hint")}</p>
      {health == null ? (
        <p className="settings-current-model">
          {t("settings.model.current")}: <strong>{packLabel(parsePack(settings.modelPack))}</strong>
        </p>
      ) : modelReady ? (
        <p className="settings-current-model">
          {t("settings.model.current")}: <strong>{packLabel(parsePack(settings.modelPack))}</strong>
        </p>
      ) : (
        <p className="settings-current-model" role="status">
          {t("settings.model.missing")}
        </p>
      )}
      {settings.modelGguf && (
        <details className="advanced-details">
          <summary>{t("settings.model.supportDetails")}</summary>
          <code>{settings.modelGguf}</code>
        </details>
      )}
      {health && (
        <p className="hint">
          {t("settings.model.gpu", {
            pack: packLabel(parsePack(health.suggestedPack)),
            vram: health.vramMib != null
              ? t("settings.model.graphicsMemory", {
                  value: Math.round(health.vramMib / 1024),
                })
              : t("settings.model.unknown"),
          })}
        </p>
      )}
      <div
        className="settings-model-options"
        role="group"
        aria-label={t("settings.model.chooseAria")}
      >
        {(["q8", "q4"] as const).map((option) => (
          <div className="settings-pack-choice" key={option}>
            <button
              type="button"
              className={`btn${pack === option ? " active" : ""}`}
              aria-pressed={pack === option}
              disabled={installing}
              onClick={() => setPack(option)}
            >
              {option === "q8" ? t("settings.model.q8") : t("settings.model.q4")}
            </button>
            <span className="hint">
              {option === "q8" ? t("settings.model.q8Hint") : t("settings.model.q4Hint")}
            </span>
          </div>
        ))}
      </div>
      {modelPackVramFailureRisk(pack, health?.vramMib) ? (
        <p className="hint" role="note">
          {t("firstLaunch.gpu.q8Risk")}
        </p>
      ) : null}
      <div className="settings-pack-download">
        {needsInstall ? (
          <>
            {!settings.yue2LicenseAccepted ? (
              <>
                <p>
                  {t("firstLaunch.license.yue2Before")}{" "}
                  <a href={YUE2_LICENSE_URL} target="_blank" rel="noreferrer">
                    CC BY-NC 4.0
                  </a>{" "}
                  {t("firstLaunch.license.yue2After")}
                </p>
                <div className="settings-license-accept">
                  <input
                    id="settings-yue2-license"
                    type="checkbox"
                    checked={yue2Checked}
                    disabled={installing}
                    onChange={(event) => setYue2Checked(event.currentTarget.checked)}
                  />
                  <label htmlFor="settings-yue2-license">
                    {t("firstLaunch.license.yue2Accept")}
                  </label>
                </div>
              </>
            ) : null}
            {!settings.acceptedSeparatorLicenses?.htdemucs ? (
              <>
                <p className="hint">{t("firstLaunch.license.htdemucsSummary")}</p>
                <details>
                  <summary>{t("firstLaunch.license.htdemucsDetails")}</summary>
                  <p className="hint">{t("firstLaunch.license.htdemucsNotice")}</p>
                </details>
                <div className="settings-license-accept">
                  <input
                    id="settings-htdemucs-license"
                    type="checkbox"
                    checked={htdemucsChecked}
                    disabled={installing}
                    onChange={(event) => setHtdemucsChecked(event.currentTarget.checked)}
                  />
                  <label htmlFor="settings-htdemucs-license">
                    {t("firstLaunch.license.htdemucsAccept")}
                  </label>
                </div>
                <p className="hint">
                  <a href={HTDEMUCS_LICENSE_URL} target="_blank" rel="noreferrer">
                    {t("firstLaunch.license.htdemucsSource")}
                  </a>
                </p>
              </>
            ) : null}
            {!isTauriRuntime() ? (
              <p className="hint">{t("settings.model.engine.desktopOnly")}</p>
            ) : null}
            {!yue2Ok ? (
              <p className="hint" role="status">
                {t("firstLaunch.license.required")}
              </p>
            ) : null}
            {yue2Ok && !htdemucsOk ? (
              <p className="hint" role="status">
                {t("firstLaunch.license.htdemucsRequired")}
              </p>
            ) : null}
            <button
              type="button"
              className="btn primary"
              data-testid="settings-yue2-download"
              disabled={!isTauriRuntime() || installing || !yue2Ok || !htdemucsOk}
              onClick={() => void download()}
            >
              {downloadLabel(pack, installing)}
            </button>
            {installing ? (
              <div className="settings-engine-progress" role="status">
                <progress max={100} value={downloadPercent ?? undefined} />
                <span>{progress?.label ?? t("settings.model.downloading")}</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="hint" role="status">
            {t("settings.model.installed")}
          </p>
        )}
      </div>
    </>
  );
}
