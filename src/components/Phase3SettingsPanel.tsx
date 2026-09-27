import { useEffect, useMemo, useState } from "react";
import {
  LORA_PACK_CATALOG,
  gateLoraPackAccess,
  planOptionalLoraDownload,
  type LoraPack,
} from "@song-maker/lora-packs";
import {
  describeStemProvidersFr,
  type StemProviderId,
} from "@song-maker/stem-providers";
import { api } from "../lib/api";
import type { AppSettings, Phase3Status } from "../lib/types";
import { useAppStore } from "../store/appStore";
import { t } from "../ui/i18n";

export function Phase3SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const refreshSettings = useAppStore((s) => s.refreshSettings);
  const setError = useAppStore((s) => s.setError);
  const [phase3, setPhase3] = useState<Phase3Status | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const refreshPhase3 = async () => {
    try {
      setPhase3(await api.getPhase3Status());
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void refreshPhase3();
  }, []);

  const providers = useMemo(
    () =>
      describeStemProvidersFr({
        bsRoFormerWeightsPresent: phase3?.bsRoformerAvailable ?? false,
      }),
    [phase3?.bsRoformerAvailable],
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

  const onPlanDownload = (pack: LoraPack) => {
    const acceptance = {
      ccByNcAccepted: Boolean(settings.ccByNcAccepted ?? phase3?.ccByNcAccepted),
      allowCommercialRedistribution: false,
    };
    const gated = gateLoraPackAccess(pack.id, acceptance);
    if (!gated.ok) {
      setDownloadNotice(gated.message);
      return;
    }
    const planned = planOptionalLoraDownload(pack.id, acceptance);
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

  return (
    <section className="phase3-panel" aria-labelledby="phase3-settings-title">
      <h2 id="phase3-settings-title">{t("phase3.settings.title")}</h2>
      <p className="hint">{t("phase3.settings.intro")}</p>

      <h3>{t("phase3.separator.title")}</h3>
      <p className="hint">{phase3?.honestyFr}</p>
      <div className="phase3-provider-list">
        {providers.map((p) => {
          const selected =
            (settings.stemSeparator ?? phase3?.stemSeparator ?? "htdemucs") ===
            p.id;
          return (
            <label key={p.id} className="phase3-provider">
              <input
                type="radio"
                name="stem-separator"
                checked={selected}
                disabled={!p.runnable && p.id === "bs_roformer"}
                onChange={() => void selectSeparator(p.id)}
              />
              <span>
                <strong>{p.displayNameFr}</strong>
                <br />
                <span className="hint">{p.stemLayoutNoteFr}</span>
                {!p.runnable && p.id === "bs_roformer" && (
                  <>
                    <br />
                    <span className="hint warn">
                      {t("phase3.separator.bsMissing")}
                      {phase3 ? ` — ${phase3.bsRoformerPath}` : ""}
                    </span>
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <p className="hint">
        {t("phase3.separator.guitarPiano")}:{" "}
        {phase3?.guitarPianoAvailable
          ? t("phase3.available")
          : t("phase3.unavailable")}
      </p>

      <h3>{t("phase3.lora.title")}</h3>
      <p className="hint">{t("phase3.lora.intro")}</p>
      <label className="phase3-check">
        <input
          type="checkbox"
          checked={Boolean(settings.ccByNcAccepted)}
          onChange={(e) => void toggleCcByNc(e.target.checked)}
        />
        {t("phase3.lora.ccGate")}
      </label>
      <ul className="phase3-lora-list">
        {LORA_PACK_CATALOG.map((pack) => (
          <li key={pack.id}>
            <div>
              <strong>{pack.displayName}</strong>
              <span className="hint">
                {" "}
                · {pack.kind} · {pack.license} · {pack.repo}
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
              onClick={() => onPlanDownload(pack)}
            >
              {t("phase3.lora.planDownload")}
            </button>
          </li>
        ))}
      </ul>
      {downloadNotice && (
        <pre className="phase3-download-notice">{downloadNotice}</pre>
      )}
    </section>
  );
}
