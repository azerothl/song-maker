import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ACE_STEP_CONTRACT_BODY_EN,
  ACE_STEP_CONTRACT_BODY_FR,
  ACE_STEP_CONTRACT_CHECKBOX_EN,
  ACE_STEP_CONTRACT_CHECKBOX_FR,
  ACE_STEP_CONTRACT_QUOTE_EN,
  ACE_STEP_CONTRACT_TITLE_EN,
  ACE_STEP_CONTRACT_TITLE_FR,
  ACE_STEP_CONTRACT_VERSION,
  ACE_STEP_ENGINE_ID,
  aceStepContractFingerprint,
} from "@song-maker/stem-providers";
import { api } from "../lib/api";
import type { AppSettings, InstallProgress } from "../lib/types";
import {
  isTauriRuntime,
  runtimeApi,
  type AceStepInstallInfo,
} from "../lib/runtimeHost";
import { useAppStore } from "../store/appStore";
import { profileLocale, t } from "../ui/i18n";

export function AceStepModelSettings() {
  const settings = useAppStore((s) => s.settings);
  const settingsModelSection = useAppStore((s) => s.settingsModelSection);
  const modelSectionFocused = useRef(false);
  const profilesState = useAppStore((s) => s.profilesState);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const activeProfile = profilesState?.profiles.find((profile) => profile.isActive);
  const [info, setInfo] = useState<AceStepInstallInfo | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [licenseRead, setLicenseRead] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [legoNotice, setLegoNotice] = useState<string | null>(null);
  const [legoInfo, setLegoInfo] = useState<{
    ready: boolean;
    venvPresent: boolean;
    licenseAccepted: boolean;
    licenseNoticeFr: string;
    licenseNoticeEn: string;
    vramNoteFr: string;
    messageFr: string;
    hfRepo: string;
    gitSource: string;
  } | null>(null);
  const [legoInstalling, setLegoInstalling] = useState(false);
  const [legoLoading, setLegoLoading] = useState(true);
  const [legoLicenseRead, setLegoLicenseRead] = useState(false);
  const english = profileLocale() === "en";
  const selected = settings?.generationEngine === "ace_step";
  const licenseAccepted = Boolean(settings?.aceStepLicenseAccepted || licenseRead);
  const contractAccepted = Boolean(
    activeProfile?.acceptedEngineContractIds?.includes(ACE_STEP_ENGINE_ID),
  );

  const refreshInfo = async () => {
    if (!isTauriRuntime()) return;
    const next = await runtimeApi.aceStepInstallInfo();
    setInfo(next);
  };

  useEffect(() => {
    if (!isTauriRuntime()) {
      setLoading(false);
      setLegoLoading(false);
      return;
    }
    let cancelled = false;
    void runtimeApi
      .aceStepInstallInfo()
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch((error) => {
        if (!cancelled) setNotice(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void runtimeApi
      .aceStepLegoStatus()
      .then((next) => {
        if (!cancelled) setLegoInfo(next);
      })
      .catch(() => {
        /* Lego is optional; status failure is not a Turbo install error. */
      }).finally(() => {
        if (!cancelled) setLegoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id, settings?.cacheDir]);

  useEffect(() => {
    if (!settingsModelSection || loading || legoLoading || modelSectionFocused.current) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(settingsModelSection === "lego" ? "ace-step-lego-title" : "ace-step-model-title");
      if (!heading) return;
      modelSectionFocused.current = true;
      heading.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [settingsModelSection, loading, legoLoading]);

  useEffect(() => {
    setLicenseRead(false);
  }, [activeProfile?.id]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("ace-step-progress", (event) => {
      setProgress(event.payload);
    }).then((release) => {
      unlisten = release;
    });
    return () => unlisten?.();
  }, []);

  const updateEngine = async (generationEngine: NonNullable<AppSettings["generationEngine"]>) => {
    if (!settings) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.updateSettings({ ...settings, generationEngine });
      await refreshSettings();
      setInfo(await runtimeApi.aceStepInstallInfo());
    } catch (error) {
      setNotice(String(error));
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    setNotice(null);
    try {
      await runtimeApi.installAceStep(licenseAccepted);
      setLicenseRead(true);
      await refreshSettings();
      await refreshInfo();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setInstalling(false);
    }
  };

  const acceptCommercialContract = async () => {
    if (!activeProfile || contractAccepted) return;
    setSaving(true);
    setNotice(null);
    try {
      const fingerprint = await aceStepContractFingerprint();
      await api.acceptEngineContract(
        activeProfile.id,
        ACE_STEP_ENGINE_ID,
        fingerprint,
        ACE_STEP_CONTRACT_VERSION,
      );
      await refreshProfiles();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;
  const modelAvailable = Boolean(info?.available);
  const hasCommercialProfile = activeProfile?.kind === "commercial";
  const contractIsAccepted = contractAccepted;
  const downloadProgress = progress?.totalBytes
    ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
    : null;

  return (
    <section className="settings-detail-page ace-step-model-settings" aria-labelledby="ace-step-model-title">
      <h2 id="ace-step-model-title" tabIndex={-1}>{t("settings.model.engine.title")}</h2>
      <p className="settings-intro">{t("settings.model.engine.intro")}</p>
      <fieldset className="settings-engine-options">
        <legend>{t("settings.model.engine.choose")}</legend>
        <label className="settings-engine-option">
          <input
            type="radio"
            name="generation-engine"
            value="yue2"
            checked={!selected}
            disabled={saving}
            onChange={() => void updateEngine("yue2")}
          />
          <span>
            <strong>YuE2</strong>
            <small>{t("settings.model.engine.yue2Hint")}</small>
          </span>
        </label>
        <label className="settings-engine-option">
          <input
            type="radio"
            name="generation-engine"
            value="ace_step"
            checked={selected}
            disabled={saving || !modelAvailable || !settings.aceStepLicenseAccepted}
            onChange={() => void updateEngine("ace_step")}
          />
          <span>
            <strong>ACE-Step 1.5 Turbo BF16</strong>
            <small>{t("settings.model.engine.aceStepHint")}</small>
          </span>
        </label>
      </fieldset>

      {selected ? (
        <p className="hint" role="note">{t("settings.model.engine.aceStepLimits")}</p>
      ) : null}

      <div className="ace-step-download">
        <h3>{t("settings.model.engine.optionalDownload")}</h3>
        <details open={!settings.aceStepLicenseAccepted}>
          <summary>{t("settings.model.licenseDetails")}</summary>
          <p>{english ? info?.licenseNoticeEn : info?.licenseNoticeFr}</p>
        </details>
        {loading ? <p className="hint">{t("settings.model.engine.checking")}</p> : null}
        {!isTauriRuntime() ? (
          <p className="hint">{t("settings.model.engine.desktopOnly")}</p>
        ) : null}
        {!settings.aceStepLicenseAccepted ? (
          <label className="settings-license-accept">
            <input
              type="checkbox"
              checked={licenseAccepted}
              disabled={loading || installing}
              onChange={(event) => setLicenseRead(event.currentTarget.checked)}
            />
            <span>{t("settings.model.engine.licenseAccept")}</span>
          </label>
        ) : (
          <p className="hint" role="status">{t("settings.model.engine.downloaded")}</p>
        )}
        <div className="settings-engine-actions">
          {!modelAvailable || !settings.aceStepLicenseAccepted ? (
            <button
              type="button"
              className="btn"
              disabled={!isTauriRuntime() || installing || loading || !licenseAccepted}
              onClick={() => void install()}
            >
              {installing
                ? t("settings.model.engine.downloading")
                : modelAvailable
                  ? t("settings.model.engine.verifyAndAccept")
                  : t("settings.model.engine.download")}
            </button>
          ) : null}
          {installing ? (
            <button type="button" className="btn ghost" onClick={() => void runtimeApi.cancelAceStepInstall()}>
              {t("settings.model.engine.cancel")}
            </button>
          ) : null}
        </div>
        {installing ? (
          <div className="settings-engine-progress" role="status">
            <progress max={100} value={downloadProgress ?? undefined} />
            <span>{progress?.label ?? t("settings.model.engine.downloading")}</span>
          </div>
        ) : null}
        <details>
          <summary>{t("settings.model.engine.pinDetails")}</summary>
          <p className="hint" role="note">{t("settings.model.engine.pythonYue2")}</p>
          <p>{info?.repo} · {info?.revision}</p>
          <p>{info?.gguf} · SHA-256 {info?.sha256}</p>
          <p>
            <a href="https://huggingface.co/ACE-Step/Ace-Step1.5/blob/19671f406d603126926c1b7e2adc169acbcade22/README.md" target="_blank" rel="noopener noreferrer">
              {t("settings.model.engine.originalSource")}
            </a>
            {" · "}
            <a href="https://huggingface.co/audio-cpp/audio.cpp-gguf/tree/7bf52723f5a95b6cec53ea905fd10eca1c8b942e" target="_blank" rel="noopener noreferrer">
              {t("settings.model.engine.convertedSource")}
            </a>
            {" · "}
            <a href="https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/tree/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3" target="_blank" rel="noopener noreferrer">
              {t("profiles.engines.aceStepSource.qwenEmbedding")}
            </a>
            {" · "}
            <a href="https://huggingface.co/Qwen/Qwen3-1.7B/tree/70d244cc86ccca08cf5af4e1e306ecf908b1ad5e" target="_blank" rel="noopener noreferrer">
              {t("profiles.engines.aceStepSource.qwenLm")}
            </a>
            {" · "}
            <a href="https://huggingface.co/ACE-Step/Ace-Step1.5/tree/19671f406d603126926c1b7e2adc169acbcade22/vae" target="_blank" rel="noopener noreferrer">
              {t("profiles.engines.aceStepSource.vae")}
            </a>
          </p>
        </details>
      </div>

      {hasCommercialProfile && selected ? (
        <fieldset className="settings-engine-contract">
          <legend>{english ? ACE_STEP_CONTRACT_TITLE_EN : ACE_STEP_CONTRACT_TITLE_FR}</legend>
          <p>{english ? ACE_STEP_CONTRACT_BODY_EN : ACE_STEP_CONTRACT_BODY_FR}</p>
          <blockquote>{ACE_STEP_CONTRACT_QUOTE_EN}</blockquote>
          <label className="settings-license-accept">
            <input
              type="checkbox"
              checked={contractIsAccepted}
              disabled={saving || contractIsAccepted}
              onChange={() => void acceptCommercialContract()}
            />
            <span>{english ? ACE_STEP_CONTRACT_CHECKBOX_EN : ACE_STEP_CONTRACT_CHECKBOX_FR}</span>
          </label>
        </fieldset>
      ) : null}

      <div className="ace-step-download" aria-labelledby="ace-step-lego-title">
        <h3 id="ace-step-lego-title" tabIndex={-1}>{t("settings.model.lego.title")}</h3>
        <p>{t("settings.model.lego.intro")}</p>
        <p className="hint" role="note">
          {t("settings.model.lego.vram")}
        </p>
        <details open={!settings.aceStepLegoLicenseAccepted}>
          <summary>{t("settings.model.licenseDetails")}</summary>
          <p>{english ? legoInfo?.licenseNoticeEn : legoInfo?.licenseNoticeFr}</p>
        </details>
        {!settings.aceStepLegoLicenseAccepted ? (
          <label className="settings-license-accept">
            <input
              type="checkbox"
              checked={legoLicenseRead}
              disabled={legoInstalling}
              onChange={(event) => setLegoLicenseRead(event.currentTarget.checked)}
            />
            <span>{t("settings.model.engine.licenseAccept")}</span>
          </label>
        ) : (
          <p className="hint" role="status">{t("settings.model.lego.accepted")}</p>
        )}
        <div className="settings-engine-actions">
          <button
            type="button"
            className="btn"
            disabled={
              !isTauriRuntime()
              || legoInstalling
              || !(settings.aceStepLegoLicenseAccepted || legoLicenseRead)
            }
            onClick={() => {
              setLegoInstalling(true);
              setLegoNotice(null);
              void runtimeApi
                .installAceStepLego(
                  Boolean(settings.aceStepLegoLicenseAccepted || legoLicenseRead),
                )
                .then(async () => {
                  await refreshSettings();
                  setLegoInfo(await runtimeApi.aceStepLegoStatus());
                })
                .catch((error) => setLegoNotice(String(error)))
                .finally(() => setLegoInstalling(false));
            }}
          >
            {legoInstalling
              ? t("settings.model.lego.installing")
              : t("settings.model.lego.install")}
          </button>
          {legoInstalling ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => void runtimeApi.cancelAceStepLegoInstall()}
            >
              {t("settings.model.engine.cancel")}
            </button>
          ) : null}
        </div>
        {legoInfo ? (
          <p className="hint">{legoInfo.messageFr}</p>
        ) : null}
        {legoNotice ? (
          <p className="settings-engine-error" role="alert">{legoNotice}</p>
        ) : null}
      </div>

      {notice ? <p className="settings-engine-error" role="alert">{notice}</p> : null}
    </section>
  );
}
