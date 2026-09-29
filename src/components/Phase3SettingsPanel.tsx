import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  LORA_PACK_CATALOG,
  gateLoraPackAccess,
  planOptionalLoraDownload,
  requestOptionalLoraDownload,
  compatibilityLabelFr,
  type LoraPack,
} from "@song-maker/lora-packs";
import {
  describeStemProvidersFr,
  canDownloadSeparator,
  separatorLicense,
  type StemProviderId,
} from "@song-maker/stem-providers";
import { api } from "../lib/api";
import type { AppSettings, InstallProgress, Phase3Status } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function Phase3SettingsPanel({
  view,
}: {
  view: "separation" | "lora";
}) {
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setError = useAppStore((s) => s.setError);
  const [phase3, setPhase3] = useState<Phase3Status | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [installingHtDemucs6s, setInstallingHtDemucs6s] = useState(false);
  const [installingBsRoFormer, setInstallingBsRoFormer] = useState(false);
  const [installingMelBand, setInstallingMelBand] = useState(false);
  const [bsProgress, setBsProgress] = useState<InstallProgress | null>(null);
  const [bsInfo, setBsInfo] = useState<Awaited<
    ReturnType<typeof api.bsRoFormerInstallInfo>
  > | null>(null);
  const [melInfo, setMelInfo] = useState<Awaited<
    ReturnType<typeof api.melBandRoFormerInstallInfo>
  > | null>(null);

  const refreshPhase3 = async () => {
    try {
      setPhase3(await api.getPhase3Status());
      setBsInfo(await api.bsRoFormerInstallInfo());
      setMelInfo(await api.melBandRoFormerInstallInfo());
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void refreshPhase3();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<InstallProgress>("bs-roformer-progress", (event) => {
      setBsProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const providers = useMemo(
    () =>
      describeStemProvidersFr({
        bsRoFormerWeightsPresent: phase3?.bsRoformerAvailable ?? false,
        melBandRoFormerWeightsPresent:
          phase3?.melBandRoformerAvailable ?? false,
        htdemucs6sRuntimeAvailable:
          phase3?.htdemucs6sRuntimeAvailable ?? false,
      }),
    [
      phase3?.bsRoformerAvailable,
      phase3?.melBandRoformerAvailable,
      phase3?.htdemucs6sRuntimeAvailable,
    ],
  );

  if (!settings) return null;

  const selectSeparator = async (id: StemProviderId) => {
    try {
      const next: AppSettings = {
        ...settings,
        stemSeparator: id,
      };
      await api.updateSettings(next);
      await refreshSettings();
      await refreshPhase3();
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleCcByNc = async (accepted: boolean) => {
    try {
      await api.updateSettings({
        ...settings,
        ccByNcAccepted: accepted,
      });
      await refreshSettings();
      await refreshPhase3();
    } catch (e) {
      setError(String(e));
    }
  };

  const installBsRoFormer = async () => {
    if (
      !canDownloadSeparator(
        "bs_roformer",
        settings?.acceptedSeparatorLicenses ??
          phase3?.acceptedSeparatorLicenses,
      )
    ) {
      setDownloadNotice(t("separate.license.blocked"));
      return;
    }
    setInstallingBsRoFormer(true);
    setDownloadNotice(null);
    setBsProgress(null);
    try {
      const path = await api.installBsRoFormer();
      await refreshPhase3();
      setDownloadNotice(`${t("phase3.separator.bsInstallOk")}\n${path}`);
    } catch (e) {
      setDownloadNotice(String(e));
    } finally {
      setInstallingBsRoFormer(false);
    }
  };

  const installMelBand = async () => {
    if (
      !canDownloadSeparator(
        "mel_band_roformer",
        settings?.acceptedSeparatorLicenses ??
          phase3?.acceptedSeparatorLicenses,
      )
    ) {
      setDownloadNotice(t("separate.license.blocked"));
      return;
    }
    setInstallingMelBand(true);
    setDownloadNotice(null);
    try {
      const path = await api.installMelBandRoFormer();
      await refreshPhase3();
      setDownloadNotice(`${t("phase3.separator.melInstallOk")}\n${path}`);
    } catch (e) {
      setDownloadNotice(String(e));
    } finally {
      setInstallingMelBand(false);
    }
  };

  const installHtDemucs6s = async () => {
    if (
      !canDownloadSeparator(
        "htdemucs_6s",
        settings?.acceptedSeparatorLicenses ??
          phase3?.acceptedSeparatorLicenses,
      )
    ) {
      setDownloadNotice(t("separate.license.blocked"));
      return;
    }
    setInstallingHtDemucs6s(true);
    setDownloadNotice(null);
    try {
      const path = await api.installHtDemucs6sRuntime();
      await refreshPhase3();
      setDownloadNotice(`${t("phase3.separator.onnxInstallOk")}\n${path}`);
    } catch (e) {
      setDownloadNotice(String(e));
    } finally {
      setInstallingHtDemucs6s(false);
    }
  };

  const toggleLicense = async (id: StemProviderId, accepted: boolean) => {
    if (!settings) return;
    try {
      await api.updateSettings({
        ...settings,
        acceptedSeparatorLicenses: {
          ...(settings.acceptedSeparatorLicenses ?? {}),
          [id]: accepted,
        },
      });
      await refreshSettings();
      await refreshPhase3();
    } catch (e) {
      setError(String(e));
    }
  };

  const cancelBsRoFormer = async () => {
    try {
      await api.cancelBsRoFormerInstall();
    } catch (e) {
      setDownloadNotice(String(e));
    }
  };

  const acceptance = () => ({
    ccByNcAccepted: Boolean(settings.ccByNcAccepted ?? phase3?.ccByNcAccepted),
    allowCommercialRedistribution: false,
  });

  const onPlanDownload = (pack: LoraPack) => {
    const gated = gateLoraPackAccess(pack.id, acceptance());
    if (!gated.ok) {
      setDownloadNotice(gated.message);
      return;
    }
    const planned = planOptionalLoraDownload(pack.id, acceptance());
    if (!planned.ok || !planned.plan) {
      setDownloadNotice(
        !planned.ok ? planned.message : t("phase3.lora.planFailed"),
      );
      return;
    }
    const lines = planned.plan.files
      .map((f) => `• ${f.filename}\n  ${f.url}\n  → cache/${f.relativeCachePath}`)
      .join("\n");
    setDownloadNotice(
      `${planned.plan.noticeFr}\n\n${lines}\n\n${t("phase3.lora.manualDownload")}`,
    );
  };

  const onDownloadToCache = async (pack: LoraPack) => {
    setDownloadingId(pack.id);
    setDownloadNotice(null);
    try {
      const result = await requestOptionalLoraDownload(
        pack.id,
        acceptance(),
        (url, relativeCachePath, expectedSha256) =>
          api.downloadCacheFile(url, relativeCachePath, expectedSha256),
      );
      if (!result.ok) {
        setDownloadNotice(result.message);
        return;
      }
      const paths = result.savedPaths?.join("\n") ?? "";
      setDownloadNotice(
        `${t("phase3.lora.downloadOk")}\n${paths}\n\n${result.plan?.noticeFr ?? ""}`,
      );
    } catch (e) {
      setDownloadNotice(String(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const bsBytesLabel = bsInfo
    ? `${(bsInfo.bytes / (1024 * 1024)).toFixed(0)} Mo`
    : "~165 Mo";

  return (
    <section
      className="phase3-panel"
      aria-labelledby={`phase3-settings-title-${view}`}
    >
      <h2 id={`phase3-settings-title-${view}`}>
        {view === "separation"
          ? t("phase3.settings.title")
          : t("phase3.lora.title")}
      </h2>
      <p className="hint">
        {view === "separation"
          ? t("phase3.settings.intro")
          : t("phase3.lora.intro")}
      </p>

      {view === "separation" && (
        <>
      <h3>{t("phase3.separator.title")}</h3>
      <p className="hint">{phase3?.honestyFr}</p>
      <div className="phase3-provider-list">
        {providers.map((p) => {
          const selected =
            (settings.stemSeparator ?? phase3?.stemSeparator ?? "htdemucs") ===
            p.id;
          const license = separatorLicense(p.id);
          const accepted = Boolean(
            settings.acceptedSeparatorLicenses?.[p.id] ??
              phase3?.acceptedSeparatorLicenses?.[p.id],
          );
          return (
            <label key={p.id} className="phase3-provider">
              <input
                type="radio"
                name="stem-separator"
                checked={selected}
                disabled={!p.runnable && p.id !== "htdemucs"}
                onChange={() => void selectSeparator(p.id)}
              />
              <span>
                <strong>{p.displayNameFr}</strong>
                {license && (
                  <>
                    {" "}
                    <span className="sep-license-badge">{license.badgeFr}</span>
                  </>
                )}
                <br />
                <span className="hint">{p.stemLayoutNoteFr}</span>
                {license && (
                  <>
                    <br />
                    <a href={license.sourceUrl} target="_blank" rel="noreferrer">
                      {license.sourceLabelFr}
                    </a>
                  </>
                )}
                {!p.runnable && p.id === "bs_roformer" && (
                  <>
                    <br />
                    <span className="hint warn">
                      {t("phase3.separator.bsMissing")}
                      {phase3 ? ` — ${phase3.bsRoformerPath}` : ""}
                    </span>
                  </>
                )}
                {!p.runnable && p.id === "mel_band_roformer" && (
                  <>
                    <br />
                    <span className="hint warn">
                      {t("phase3.separator.melMissing")}
                      {phase3 ? ` — ${phase3.melBandRoformerPath}` : ""}
                    </span>
                  </>
                )}
                {!p.runnable && p.id === "htdemucs_6s" && (
                  <>
                    <br />
                    <span className="hint warn">
                      {t("phase3.separator.onnxRuntimeMissing")}
                    </span>
                  </>
                )}
                {license?.requiresAcceptBeforeDownload && !p.runnable && (
                  <>
                    <br />
                    <span className="sep-license-cb">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => {
                          e.stopPropagation();
                          void toggleLicense(p.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {t("separate.license.accept")}
                    </span>
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {!phase3?.melBandRoformerAvailable && (
        <div className="phase3-bs-install">
          <p className="hint">{t("phase3.separator.melInstallHint")}</p>
          {melInfo && <p className="hint">{melInfo.licenseNoticeFr}</p>}
          <button
            type="button"
            className="btn"
            disabled={
              installingMelBand ||
              !canDownloadSeparator(
                "mel_band_roformer",
                settings.acceptedSeparatorLicenses ??
                  phase3?.acceptedSeparatorLicenses,
              )
            }
            title={
              canDownloadSeparator(
                "mel_band_roformer",
                settings.acceptedSeparatorLicenses ??
                  phase3?.acceptedSeparatorLicenses,
              )
                ? undefined
                : t("separate.license.blocked")
            }
            onClick={() => void installMelBand()}
          >
            {installingMelBand
              ? t("phase3.separator.melInstalling")
              : t("phase3.separator.melInstall")}
          </button>
        </div>
      )}
      {!phase3?.bsRoformerAvailable && (
        <div className="phase3-bs-install">
          <p className="hint">{t("phase3.separator.bsInstallHint")}</p>
          {bsInfo && (
            <p className="hint">
              {bsInfo.licenseNoticeFr}
              <br />
              {t("phase3.separator.bsInstallMeta")
                .replace("{size}", bsBytesLabel)
                .replace("{sha}", bsInfo.sha256.slice(0, 12))}
            </p>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={
                installingBsRoFormer ||
                !canDownloadSeparator(
                  "bs_roformer",
                  settings.acceptedSeparatorLicenses ??
                    phase3?.acceptedSeparatorLicenses,
                )
              }
              title={
                canDownloadSeparator(
                  "bs_roformer",
                  settings.acceptedSeparatorLicenses ??
                    phase3?.acceptedSeparatorLicenses,
                )
                  ? undefined
                  : t("separate.license.blocked")
              }
              onClick={() => void installBsRoFormer()}
            >
              {installingBsRoFormer
                ? t("phase3.separator.bsInstalling")
                : t("phase3.separator.bsInstall")}
            </button>
            {installingBsRoFormer && (
              <button
                type="button"
                className="btn"
                onClick={() => void cancelBsRoFormer()}
              >
                {t("phase3.separator.bsCancel")}
              </button>
            )}
          </div>
          {bsProgress && installingBsRoFormer && (
            <p className="hint" aria-live="polite">
              {bsProgress.label}
              {bsProgress.totalBytes
                ? ` — ${Math.min(
                    100,
                    Math.round(
                      (100 * bsProgress.receivedBytes) / bsProgress.totalBytes,
                    ),
                  )}%`
                : ""}
            </p>
          )}
        </div>
      )}
      {!phase3?.htdemucs6sRuntimeAvailable && (
        <button
          type="button"
          className="btn"
          disabled={
            installingHtDemucs6s ||
            !canDownloadSeparator(
              "htdemucs_6s",
              settings.acceptedSeparatorLicenses ??
                phase3?.acceptedSeparatorLicenses,
            )
          }
          title={
            canDownloadSeparator(
              "htdemucs_6s",
              settings.acceptedSeparatorLicenses ??
                phase3?.acceptedSeparatorLicenses,
            )
              ? undefined
              : t("separate.license.blocked")
          }
          onClick={() => void installHtDemucs6s()}
        >
          {installingHtDemucs6s
            ? t("phase3.separator.onnxInstalling")
            : t("phase3.separator.onnxInstall")}
        </button>
      )}
      <p className="hint">
        {t("phase3.separator.guitarPiano")}:{" "}
        {phase3?.guitarPianoAvailable
          ? t("phase3.available")
          : t("phase3.unavailable")}
      </p>
      {downloadNotice && (
        <pre className="phase3-download-notice">{downloadNotice}</pre>
      )}
        </>
      )}

      {view === "lora" && (
        <>
      <label className="phase3-check">
        <input
          type="checkbox"
          checked={Boolean(settings.ccByNcAccepted)}
          onChange={(e) => void toggleCcByNc(e.target.checked)}
        />
        {t("phase3.lora.ccGate")}
      </label>
      <ul className="phase3-lora-list">
        {LORA_PACK_CATALOG.map((pack) => {
          const installable = pack.compatibilityStatus === "verified";
          return (
          <li key={pack.id}>
            <div>
              <strong>{pack.displayName}</strong>
              <span className="hint">
                {" "}
                · {pack.kind} · {compatibilityLabelFr(pack.compatibilityStatus)} · {pack.license} · {pack.repo}
              </span>
              {pack.trigger && (
                <span className="hint"> · trigger « {pack.trigger} »</span>
              )}
              <br />
              <span className="hint">{pack.notes}</span>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={!installable}
                onClick={() => onPlanDownload(pack)}
              >
                {t("phase3.lora.planDownload")}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={
                  !installable ||
                  downloadingId === pack.id ||
                  !settings.ccByNcAccepted
                }
                onClick={() => void onDownloadToCache(pack)}
              >
                {downloadingId === pack.id
                  ? t("phase3.lora.downloading")
                  : t("phase3.lora.download")}
              </button>
            </div>
          </li>
          );
        })}
      </ul>
      {downloadNotice && (
        <pre className="phase3-download-notice">{downloadNotice}</pre>
      )}
        </>
      )}
    </section>
  );
}
